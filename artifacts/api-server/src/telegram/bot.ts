import { logger } from "../lib/logger";
import {
  TelegramClient,
  type TelegramMessage,
  type TelegramUpdate,
} from "./client";

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 2_000;

const HELP_MESSAGE = `JobAlert — commandes disponibles

/start — démarrer JobAlert
/offres — voir les dernières offres
/preferences — afficher mes préférences
/modifier — modifier ma recherche
/metier — modifier le métier recherché
/contrat — modifier le type de contrat
/pays — modifier les pays
/lieux — modifier les villes ou régions
/alertes — modifier la fréquence des alertes
/pause — suspendre les notifications
/reprendre — reprendre les notifications
/stop — arrêter les notifications
/aide — afficher cette aide`;

const WELCOME_MESSAGE = `Bienvenue sur JobAlert !

Je rechercherai automatiquement les offres qui correspondent à tes critères et je te les enverrai directement ici.

La configuration de ta recherche sera disponible dans la prochaine phase. Pour le moment, le bot Telegram est prêt et répond aux commandes de base.

Utilise /aide pour voir les commandes disponibles.`;

const NOT_READY_MESSAGE = `La recherche d'offres sera activée après la connexion des premières sources.

Aucune offre n'est simulée : JobAlert t'indiquera uniquement des offres réellement récupérées.`;

type UserState = {
  paused: boolean;
  stopped: boolean;
};

export class JobAlertBot {
  private readonly client: TelegramClient;
  private readonly users = new Map<number, UserState>();
  private running = false;
  private offset = 0;

  constructor(token: string) {
    this.client = new TelegramClient(token);
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const bot = await this.client.getMe();
    this.running = true;
    logger.info({ username: bot.username }, "JobAlert Telegram bot connected");
    void this.poll();
  }

  stop(): void {
    this.running = false;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.client.getUpdates(
          this.offset,
          POLL_TIMEOUT_SECONDS,
        );

        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        logger.error({ err: error }, "JobAlert Telegram polling failed");
        await this.delay(RETRY_DELAY_MS);
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) {
      return;
    }

    const command = this.extractCommand(message.text);
    if (!command) {
      await this.client.sendMessage(
        message.chat.id,
        "Utilise /aide pour voir les commandes disponibles.",
      );
      return;
    }

    try {
      await this.handleCommand(message, command);
    } catch (error) {
      logger.error({ err: error, command }, "Telegram command failed");
      await this.client.sendMessage(
        message.chat.id,
        "Une erreur temporaire est survenue. Réessaie dans un instant.",
      );
    }
  }

  private async handleCommand(
    message: TelegramMessage,
    command: string,
  ): Promise<void> {
    const chatId = message.chat.id;

    switch (command) {
      case "/start":
        this.getUserState(chatId);
        await this.client.sendMessage(chatId, WELCOME_MESSAGE);
        return;
      case "/aide":
        await this.client.sendMessage(chatId, HELP_MESSAGE);
        return;
      case "/offres":
        await this.client.sendMessage(chatId, NOT_READY_MESSAGE);
        return;
      case "/preferences":
      case "/modifier":
      case "/metier":
      case "/contrat":
      case "/pays":
      case "/lieux":
      case "/alertes":
        await this.client.sendMessage(
          chatId,
          "La configuration détaillée de ta recherche sera disponible en phase 2.",
        );
        return;
      case "/pause":
        this.getUserState(chatId).paused = true;
        await this.client.sendMessage(
          chatId,
          "Notifications suspendues. Utilise /reprendre pour les réactiver.",
        );
        return;
      case "/reprendre":
        this.getUserState(chatId).paused = false;
        this.getUserState(chatId).stopped = false;
        await this.client.sendMessage(
          chatId,
          "Notifications réactivées. Les recherches seront disponibles après la connexion des sources.",
        );
        return;
      case "/stop":
        this.getUserState(chatId).stopped = true;
        this.getUserState(chatId).paused = true;
        await this.client.sendMessage(
          chatId,
          "Notifications arrêtées. Utilise /reprendre pour les réactiver.",
        );
        return;
      default:
        await this.client.sendMessage(
          chatId,
          "Commande inconnue. Utilise /aide pour voir les commandes disponibles.",
        );
    }
  }

  private getUserState(chatId: number): UserState {
    const existing = this.users.get(chatId);
    if (existing) {
      return existing;
    }

    const state: UserState = { paused: false, stopped: false };
    this.users.set(chatId, state);
    return state;
  }

  private extractCommand(text: string): string | null {
    const firstToken = text.trim().split(/\s+/, 1)[0]?.toLowerCase();
    if (!firstToken?.startsWith("/")) {
      return null;
    }

    return firstToken.split("@", 1)[0] ?? null;
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}