import {
  ensureUserPreferences,
  updateUserNotificationState,
  updateUserPreferences,
  upsertTelegramUser,
  type User,
  type UserPreferences,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  TelegramClient,
  type TelegramMessage,
  type TelegramReplyMarkup,
  type TelegramUpdate,
} from "./client";

const POLL_TIMEOUT_SECONDS = 25;
const RETRY_DELAY_MS = 2_000;

const HELP_MESSAGE = `JobAlert — commandes disponibles

/start — démarrer ou reprendre ma recherche
/offres — voir les dernières offres
/preferences — afficher mes préférences
/modifier — modifier ma recherche
/metier — modifier le métier recherché
/contrat — modifier le type de contrat
/pays — modifier les pays
/lieux — modifier les villes ou régions
/niveau — modifier le niveau d'études
/salaire — modifier le salaire minimum
/teletravail — modifier le télétravail
/langues — modifier les langues
/debut — modifier la date de début
/alertes — modifier la fréquence des alertes
/pause — suspendre les notifications
/reprendre — reprendre les notifications
/stop — arrêter les notifications
/aide — afficher cette aide`;

const WELCOME_MESSAGE = `👋 Bienvenue sur JobAlert !

Je vais rechercher automatiquement des offres correspondant à tes critères et te les envoyer directement ici.

La configuration prend moins d'une minute.`;

const CONTRACT_CHOICES = [
  { label: "🔄 Alternance", value: "Alternance" },
  { label: "🎓 Apprentissage", value: "Apprentissage" },
  { label: "🧑‍💻 Stage", value: "Stage" },
  { label: "💼 CDI", value: "CDI" },
  { label: "📄 CDD", value: "CDD" },
  { label: "🔧 Intérim", value: "Intérim" },
  { label: "🌍 Freelance", value: "Freelance" },
  { label: "🌐 Tous", value: "Tous" },
] as const;

const COUNTRY_CHOICES = [
  { label: "🇫🇷 France", value: "France" },
  { label: "🇧🇪 Belgique", value: "Belgique" },
  { label: "🇱🇺 Luxembourg", value: "Luxembourg" },
  { label: "🇩🇪 Allemagne", value: "Allemagne" },
  { label: "🇨🇭 Suisse", value: "Suisse" },
  { label: "🇮🇹 Italie", value: "Italie" },
  { label: "🇪🇸 Espagne", value: "Espagne" },
  { label: "🇦🇩 Andorre", value: "Andorre" },
  { label: "🇲🇨 Monaco", value: "Monaco" },
  { label: "🌍 Toute l'Europe", value: "Toute l'Europe" },
] as const;

const FREQUENCY_CHOICES = [
  { label: "⚡ Dès qu'une offre est trouvée", value: "immediate" },
  { label: "🌅 1 fois par jour", value: "daily" },
  { label: "🌇 2 fois par jour", value: "twice_daily" },
  { label: "📅 1 fois par semaine", value: "weekly" },
] as const;

const EDUCATION_CHOICES = [
  { label: "🎓 Bac", value: "Bac" },
  { label: "🎓 Bac+2", value: "Bac+2" },
  { label: "🎓 Bac+3", value: "Bac+3" },
  { label: "🎓 Bac+4", value: "Bac+4" },
  { label: "🎓 Bac+5", value: "Bac+5" },
  { label: "🎓 Doctorat", value: "Doctorat" },
  { label: "🌍 Peu importe", value: "Peu importe" },
] as const;

const REMOTE_WORK_CHOICES = [
  { label: "🏠 Télétravail", value: "remote" },
  { label: "🔄 Hybride", value: "hybrid" },
  { label: "🏢 Sur site", value: "onsite" },
  { label: "🌍 Peu importe", value: "any" },
] as const;

const EDIT_CHOICES = [
  "💼 Métier",
  "📋 Contrats",
  "🌍 Pays",
  "📍 Lieux",
  "🎓 Niveau d'études",
  "💰 Salaire minimum",
  "🏠 Télétravail",
  "🗣️ Langues",
  "📅 Date de début",
  "🔔 Alertes",
  "✅ Terminer",
];

const LOCATION_CHOICES = [
  "🌍 Tout le pays",
  "📍 Ajouter une ville",
  "🗺️ Ajouter une région",
  "✅ Terminer",
];

const REMOVE_KEYBOARD: TelegramReplyMarkup = { remove_keyboard: true };

type SetupStep =
  | "job_sector"
  | "contract_types"
  | "countries"
  | "country_custom"
  | "location_choice"
  | "location_custom"
  | "location_region"
  | "education_level"
  | "minimum_salary"
  | "remote_work"
  | "languages"
  | "start_date"
  | "notification_frequency"
  | "edit_menu"
  | "complete";

function keyboard(rows: string[][]): TelegramReplyMarkup {
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function buttonMatches(text: string, label: string): boolean {
  return normalize(text.replace(/^✅\s*/u, "")) === normalize(label);
}

function selectedLabel(label: string, selected: boolean): string {
  return selected ? `✅ ${label}` : label;
}

function frequencyLabel(value: string): string {
  return (
    FREQUENCY_CHOICES.find((choice) => choice.value === value)?.label ??
    "⚡ Dès qu'une offre est trouvée"
  );
}

function educationLabel(value: string | null): string {
  return (
    EDUCATION_CHOICES.find((choice) => choice.value === value)?.label ??
    value ??
    "Non renseigné"
  );
}

function remoteWorkLabel(value: string | null): string {
  return (
    REMOTE_WORK_CHOICES.find((choice) => choice.value === value)?.label ??
    "Non renseigné"
  );
}

function listOrDefault(values: string[], defaultText: string): string {
  return values.length > 0
    ? values.map((value) => `• ${value}`).join("\n")
    : defaultText;
}

export class JobAlertBot {
  private readonly client: TelegramClient;
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

    try {
      const user = await upsertTelegramUser({
        telegramId: message.from?.id ?? message.chat.id,
        username: message.from?.username,
        firstName: message.from?.first_name,
      });
      const command = this.extractCommand(message.text);

      if (command) {
        await this.handleCommand(message, command, user);
      } else {
        await this.handleText(message, user);
      }
    } catch (error) {
      logger.error({ err: error }, "Telegram update failed");
      await this.client.sendMessage(
        message.chat.id,
        "Une erreur temporaire est survenue. Réessaie dans un instant.",
      );
    }
  }

  private async handleCommand(
    message: TelegramMessage,
    command: string,
    user: User,
  ): Promise<void> {
    const chatId = message.chat.id;

    switch (command) {
      case "/start": {
        const preferences = await ensureUserPreferences(user.id);
        if (preferences.configured) {
          await this.client.sendMessage(
            chatId,
            `Ta recherche est déjà configurée.\n\n${this.formatPreferences(
              preferences,
              user,
            )}\n\nUtilise /modifier pour la modifier.`,
            { replyMarkup: REMOVE_KEYBOARD },
          );
          return;
        }

        await this.client.sendMessage(chatId, WELCOME_MESSAGE);
        await this.sendCurrentSetupPrompt(chatId, user, preferences);
        return;
      }
      case "/aide":
        await this.client.sendMessage(chatId, HELP_MESSAGE, {
          replyMarkup: REMOVE_KEYBOARD,
        });
        return;
      case "/offres":
        await this.client.sendMessage(
          chatId,
          `La recherche d'offres sera activée après la connexion des premières sources.

Aucune offre n'est simulée : JobAlert t'indiquera uniquement des offres réellement récupérées.`,
        );
        return;
      case "/preferences": {
        const preferences = await ensureUserPreferences(user.id);
        if (!preferences.configured) {
          await this.client.sendMessage(
            chatId,
            "Ta recherche n'est pas encore terminée. Je reprends la configuration.",
          );
          await this.sendCurrentSetupPrompt(chatId, user, preferences);
          return;
        }

        await this.client.sendMessage(
          chatId,
          this.formatPreferences(preferences, user),
          { replyMarkup: REMOVE_KEYBOARD },
        );
        return;
      }
      case "/modifier": {
        const preferences = await ensureUserPreferences(user.id);
        await updateUserPreferences(user.id, {
          configured: false,
          setupStep: "edit_menu",
        });
        await this.client.sendMessage(
          chatId,
          preferences.configured
            ? "Que veux-tu modifier ?"
            : "Choisis la partie de ta recherche à configurer :",
          { replyMarkup: keyboard([EDIT_CHOICES]) },
        );
        return;
      }
      case "/metier":
        await this.beginEditing(chatId, user, "job_sector");
        return;
      case "/contrat":
        await this.beginEditing(chatId, user, "contract_types");
        return;
      case "/pays":
        await this.beginEditing(chatId, user, "countries");
        return;
      case "/lieux":
        await this.beginEditing(chatId, user, "location_choice");
        return;
      case "/niveau":
        await this.beginEditing(chatId, user, "education_level");
        return;
      case "/salaire":
        await this.beginEditing(chatId, user, "minimum_salary");
        return;
      case "/teletravail":
        await this.beginEditing(chatId, user, "remote_work");
        return;
      case "/langues":
        await this.beginEditing(chatId, user, "languages");
        return;
      case "/debut":
        await this.beginEditing(chatId, user, "start_date");
        return;
      case "/alertes":
        await this.beginEditing(chatId, user, "notification_frequency");
        return;
      case "/pause":
        await updateUserNotificationState(user.id, {
          paused: true,
          stopped: user.stopped,
        });
        await this.client.sendMessage(
          chatId,
          "Notifications suspendues. Utilise /reprendre pour les réactiver.",
        );
        return;
      case "/reprendre":
        await updateUserNotificationState(user.id, {
          paused: false,
          stopped: false,
        });
        await this.client.sendMessage(
          chatId,
          "Notifications réactivées. Ta recherche peut reprendre.",
        );
        return;
      case "/stop":
        await updateUserNotificationState(user.id, {
          paused: true,
          stopped: true,
        });
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

  private async handleText(
    message: TelegramMessage,
    user: User,
  ): Promise<void> {
    const preferences = await ensureUserPreferences(user.id);
    const text = message.text?.trim() ?? "";

    switch (preferences.setupStep as SetupStep) {
      case "job_sector":
        await this.saveJobSector(message.chat.id, user, text);
        return;
      case "contract_types":
        await this.handleContractChoice(
          message.chat.id,
          user,
          preferences,
          text,
        );
        return;
      case "countries":
        await this.handleCountryChoice(
          message.chat.id,
          user,
          preferences,
          text,
        );
        return;
      case "country_custom":
        await this.saveCustomCountry(message.chat.id, user, preferences, text);
        return;
      case "location_choice":
        await this.handleLocationChoice(
          message.chat.id,
          user,
          preferences,
          text,
        );
        return;
      case "location_custom":
      case "location_region":
        await this.saveLocation(message.chat.id, user, preferences, text);
        return;
      case "education_level":
        await this.handleEducationChoice(
          message.chat.id,
          user,
          preferences,
          text,
        );
        return;
      case "minimum_salary":
        await this.saveMinimumSalary(message.chat.id, user, preferences, text);
        return;
      case "remote_work":
        await this.handleRemoteWorkChoice(
          message.chat.id,
          user,
          preferences,
          text,
        );
        return;
      case "languages":
        await this.saveLanguages(message.chat.id, user, preferences, text);
        return;
      case "start_date":
        await this.saveStartDate(message.chat.id, user, preferences, text);
        return;
      case "notification_frequency":
        await this.handleFrequencyChoice(
          message.chat.id,
          user,
          preferences,
          text,
        );
        return;
      case "edit_menu":
        await this.handleEditChoice(message.chat.id, user, text);
        return;
      default:
        await this.client.sendMessage(
          message.chat.id,
          "Utilise /preferences pour voir ta recherche ou /modifier pour la changer.",
          { replyMarkup: REMOVE_KEYBOARD },
        );
    }
  }

  private async beginEditing(
    chatId: number,
    user: User,
    step: SetupStep,
  ): Promise<void> {
    await ensureUserPreferences(user.id);
    await updateUserPreferences(user.id, {
      configured: false,
      setupStep: step,
    });
    await this.sendCurrentSetupPrompt(
      chatId,
      user,
      await ensureUserPreferences(user.id),
    );
  }

  private async saveJobSector(
    chatId: number,
    user: User,
    value: string,
  ): Promise<void> {
    if (value.length < 2) {
      await this.client.sendMessage(
        chatId,
        "Indique un métier ou un secteur, par exemple « Cybersécurité » ou « Data Analyst ».",
      );
      return;
    }

    const preferences = await updateUserPreferences(user.id, {
      jobSector: value.slice(0, 160),
      setupStep: "contract_types",
    });
    await this.client.sendMessage(
      chatId,
      "📋 Quel type d'emploi recherches-tu ?\n\nTu peux sélectionner plusieurs choix, puis appuyer sur « ✅ Terminer ».",
      { replyMarkup: this.contractKeyboard(preferences.contractTypes) },
    );
  }

  private async handleContractChoice(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    text: string,
  ): Promise<void> {
    if (normalize(text) === normalize("✅ Terminer")) {
      if (preferences.contractTypes.length === 0) {
        await this.client.sendMessage(
          chatId,
          "Sélectionne au moins un type d'emploi, ou choisis « 🌐 Tous ».",
        );
        return;
      }

      const next = await updateUserPreferences(user.id, {
        setupStep: "countries",
      });
      await this.sendCountryPrompt(chatId, next);
      return;
    }

    const choice = CONTRACT_CHOICES.find((candidate) =>
      buttonMatches(text, candidate.label),
    );
    if (!choice) {
      await this.client.sendMessage(
        chatId,
        "Utilise les boutons pour sélectionner les contrats, puis « ✅ Terminer ».",
        { replyMarkup: this.contractKeyboard(preferences.contractTypes) },
      );
      return;
    }

    const values =
      choice.value === "Tous"
        ? ["Tous"]
        : [
            ...preferences.contractTypes.filter((value) => value !== "Tous"),
            ...(preferences.contractTypes.includes(choice.value)
              ? []
              : [choice.value]),
          ];
    const updatedValues =
      choice.value !== "Tous" &&
      preferences.contractTypes.includes(choice.value)
        ? values.filter((value) => value !== choice.value)
        : values;
    const next = await updateUserPreferences(user.id, {
      contractTypes: updatedValues,
    });
    await this.client.sendMessage(
      chatId,
      `Sélection actuelle : ${listOrDefault(
        next.contractTypes,
        "aucun contrat",
      )}\n\nChoisis d'autres contrats ou « ✅ Terminer ».`,
      { replyMarkup: this.contractKeyboard(next.contractTypes) },
    );
  }

  private async sendCountryPrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    await this.client.sendMessage(
      chatId,
      `🌍 Dans quels pays veux-tu chercher ?\n\nSélection actuelle : ${listOrDefault(
        preferences.countries,
        "aucun pays",
      )}\n\nTu peux en sélectionner plusieurs.`,
      { replyMarkup: this.countryKeyboard(preferences.countries) },
    );
  }

  private async handleCountryChoice(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    text: string,
  ): Promise<void> {
    if (normalize(text) === normalize("✅ Terminer")) {
      if (preferences.countries.length === 0) {
        await this.client.sendMessage(
          chatId,
          "Sélectionne au moins un pays, ou choisis « 🌍 Toute l'Europe ».",
        );
        return;
      }

      const next = await updateUserPreferences(user.id, {
        setupStep: "location_choice",
      });
      await this.sendLocationPrompt(chatId, next);
      return;
    }

    if (normalize(text) === normalize("✏️ Choisir moi-même")) {
      await updateUserPreferences(user.id, { setupStep: "country_custom" });
      await this.client.sendMessage(
        chatId,
        "Écris le nom d'un pays. Tu pourras ensuite en ajouter d'autres.",
        { replyMarkup: REMOVE_KEYBOARD },
      );
      return;
    }

    const choice = COUNTRY_CHOICES.find((candidate) =>
      buttonMatches(text, candidate.label),
    );
    if (!choice) {
      await this.sendCountryPrompt(chatId, preferences);
      return;
    }

    const alreadySelected = preferences.countries.includes(choice.value);
    const values = alreadySelected
      ? preferences.countries.filter((value) => value !== choice.value)
      : choice.value === "Toute l'Europe"
        ? ["Toute l'Europe"]
        : [
            ...preferences.countries.filter(
              (value) => value !== "Toute l'Europe",
            ),
            choice.value,
          ];
    const next = await updateUserPreferences(user.id, { countries: values });
    await this.sendCountryPrompt(chatId, next);
  }

  private async saveCustomCountry(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    value: string,
  ): Promise<void> {
    if (value.length < 2) {
      await this.client.sendMessage(chatId, "Écris un nom de pays valide.");
      return;
    }

    const countries = preferences.countries.some(
      (country) => normalize(country) === normalize(value),
    )
      ? preferences.countries
      : [...preferences.countries, value.slice(0, 80)];
    const next = await updateUserPreferences(user.id, {
      countries,
      setupStep: "countries",
    });
    await this.sendCountryPrompt(chatId, next);
  }

  private async sendLocationPrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    await this.client.sendMessage(
      chatId,
      `📍 Veux-tu préciser des villes ou régions ?\n\nLieux actuels : ${listOrDefault(
        preferences.locations,
        "tout le pays",
      )}`,
      { replyMarkup: keyboard([LOCATION_CHOICES]) },
    );
  }

  private async handleLocationChoice(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    text: string,
  ): Promise<void> {
    const normalized = normalize(text);
    if (normalized === normalize("🌍 Tout le pays")) {
      const next = await updateUserPreferences(user.id, {
        locations: [],
        setupStep: "education_level",
      });
      await this.sendEducationPrompt(chatId, next);
      return;
    }

    if (normalized === normalize("📍 Ajouter une ville")) {
      await updateUserPreferences(user.id, { setupStep: "location_custom" });
      await this.client.sendMessage(
        chatId,
        "Écris le nom d'une ville. Tu pourras en ajouter d'autres.",
        { replyMarkup: REMOVE_KEYBOARD },
      );
      return;
    }

    if (normalized === normalize("🗺️ Ajouter une région")) {
      await updateUserPreferences(user.id, { setupStep: "location_region" });
      await this.client.sendMessage(
        chatId,
        "Écris le nom d'une région. Tu pourras en ajouter d'autres.",
        { replyMarkup: REMOVE_KEYBOARD },
      );
      return;
    }

    if (normalized === normalize("✅ Terminer")) {
      const next = await updateUserPreferences(user.id, {
        setupStep: "education_level",
      });
      await this.sendEducationPrompt(chatId, next);
      return;
    }

    await this.sendLocationPrompt(chatId, preferences);
  }

  private async saveLocation(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    value: string,
  ): Promise<void> {
    if (value.length < 2) {
      await this.client.sendMessage(chatId, "Écris un lieu valide.");
      return;
    }

    const locations = preferences.locations.some(
      (location) => normalize(location) === normalize(value),
    )
      ? preferences.locations
      : [...preferences.locations, value.slice(0, 100)];
    const next = await updateUserPreferences(user.id, {
      locations,
      setupStep: "location_choice",
    });
    await this.sendLocationPrompt(chatId, next);
  }

  private async sendEducationPrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    await this.client.sendMessage(
      chatId,
      `🎓 Quel est ton niveau d'études ?\n\nNiveau actuel : ${educationLabel(
        preferences.educationLevel,
      )}\n\nCe critère est facultatif.`,
      {
        replyMarkup: keyboard([
          ...EDUCATION_CHOICES.map((choice) => [choice.label]),
          ["⏭️ Ignorer"],
        ]),
      },
    );
  }

  private async handleEducationChoice(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    text: string,
  ): Promise<void> {
    const choice = EDUCATION_CHOICES.find((candidate) =>
      buttonMatches(text, candidate.label),
    );
    const changes =
      normalize(text) === normalize("⏭️ Ignorer")
        ? { educationLevel: null, setupStep: "minimum_salary" as const }
        : choice
          ? {
              educationLevel: choice.value,
              setupStep: "minimum_salary" as const,
            }
          : null;

    if (!changes) {
      await this.sendEducationPrompt(chatId, preferences);
      return;
    }

    const next = await updateUserPreferences(user.id, changes);
    await this.sendMinimumSalaryPrompt(chatId, next);
  }

  private async sendMinimumSalaryPrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    const current =
      preferences.minimumSalary === null
        ? "Non renseigné"
        : `${preferences.minimumSalary} €`;
    await this.client.sendMessage(
      chatId,
      `💰 Quel salaire minimum souhaites-tu ?\n\nMinimum actuel : ${current}\n\nÉcris un montant en euros, par exemple « 1800 ». Ce critère est facultatif.`,
      { replyMarkup: keyboard([["⏭️ Ignorer"]]) },
    );
  }

  private async saveMinimumSalary(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    value: string,
  ): Promise<void> {
    if (normalize(value) === normalize("⏭️ Ignorer")) {
      const next = await updateUserPreferences(user.id, {
        minimumSalary: null,
        setupStep: "remote_work",
      });
      await this.sendRemoteWorkPrompt(chatId, next);
      return;
    }

    const numericValue = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (
      !Number.isSafeInteger(numericValue) ||
      numericValue <= 0 ||
      numericValue > 10_000_000
    ) {
      await this.client.sendMessage(
        chatId,
        "Indique un montant en euros supérieur à 0, par exemple « 1800 », ou choisis « ⏭️ Ignorer ».",
        { replyMarkup: keyboard([["⏭️ Ignorer"]]) },
      );
      return;
    }

    const next = await updateUserPreferences(user.id, {
      minimumSalary: numericValue,
      setupStep: "remote_work",
    });
    await this.sendRemoteWorkPrompt(chatId, next);
  }

  private async sendRemoteWorkPrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    await this.client.sendMessage(
      chatId,
      `🏠 Quel mode de travail préfères-tu ?\n\nMode actuel : ${remoteWorkLabel(
        preferences.remoteWork,
      )}\n\nCe critère est facultatif.`,
      {
        replyMarkup: keyboard([
          ...REMOTE_WORK_CHOICES.map((choice) => [choice.label]),
          ["⏭️ Ignorer"],
        ]),
      },
    );
  }

  private async handleRemoteWorkChoice(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    text: string,
  ): Promise<void> {
    const choice = REMOTE_WORK_CHOICES.find((candidate) =>
      buttonMatches(text, candidate.label),
    );
    const changes =
      normalize(text) === normalize("⏭️ Ignorer")
        ? { remoteWork: null, setupStep: "languages" as const }
        : choice
          ? {
              remoteWork: choice.value,
              setupStep: "languages" as const,
            }
          : null;

    if (!changes) {
      await this.sendRemoteWorkPrompt(chatId, preferences);
      return;
    }

    const next = await updateUserPreferences(user.id, changes);
    await this.sendLanguagesPrompt(chatId, next);
  }

  private async sendLanguagesPrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    await this.client.sendMessage(
      chatId,
      `🗣️ Quelles langues maîtrises-tu ?\n\nLangues actuelles : ${listOrDefault(
        preferences.languages,
        "Non renseignées",
      )}\n\nÉcris-les séparées par des virgules, par exemple « français, anglais ». Ce critère est facultatif.`,
      { replyMarkup: keyboard([["⏭️ Ignorer"]]) },
    );
  }

  private async saveLanguages(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    value: string,
  ): Promise<void> {
    if (normalize(value) === normalize("⏭️ Ignorer")) {
      const next = await updateUserPreferences(user.id, {
        languages: [],
        setupStep: "start_date",
      });
      await this.sendStartDatePrompt(chatId, next);
      return;
    }

    const languages = [
      ...new Map(
        value
          .split(/[,;\n]+/)
          .map((language) => language.trim().slice(0, 50))
          .filter((language) => language.length >= 2)
          .map((language) => [normalize(language), language] as const),
      ).values(),
    ].slice(0, 10);
    if (languages.length === 0) {
      await this.client.sendMessage(
        chatId,
        "Indique au moins une langue, séparée par des virgules, ou choisis « ⏭️ Ignorer ».",
        { replyMarkup: keyboard([["⏭️ Ignorer"]]) },
      );
      return;
    }

    const next = await updateUserPreferences(user.id, {
      languages,
      setupStep: "start_date",
    });
    await this.sendStartDatePrompt(chatId, next);
  }

  private async sendStartDatePrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    await this.client.sendMessage(
      chatId,
      `📅 À partir de quelle date peux-tu commencer ?\n\nDate actuelle: ${
        preferences.startDate ?? "Non renseignée"
      }\n\nUtilise le format AAAA-MM-JJ. Ce critère est facultatif.`,
      { replyMarkup: keyboard([["⏭️ Ignorer"]]) },
    );
  }

  private async saveStartDate(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    value: string,
  ): Promise<void> {
    const trimmedValue = value.trim();
    if (normalize(trimmedValue) === normalize("⏭️ Ignorer")) {
      const next = await updateUserPreferences(user.id, {
        startDate: null,
        setupStep: "notification_frequency",
      });
      await this.sendFrequencyPrompt(chatId, next);
      return;
    }

    if (!this.isValidCalendarDate(trimmedValue)) {
      await this.client.sendMessage(
        chatId,
        "Indique une date valide au format AAAA-MM-JJ, par exemple « 2026-10-01 », ou choisis « ⏭️ Ignorer ».",
        { replyMarkup: keyboard([["⏭️ Ignorer"]]) },
      );
      return;
    }

    const next = await updateUserPreferences(user.id, {
      startDate: trimmedValue,
      setupStep: "notification_frequency",
    });
    await this.sendFrequencyPrompt(chatId, next);
  }

  private isValidCalendarDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private async sendFrequencyPrompt(
    chatId: number,
    preferences: UserPreferences,
  ): Promise<void> {
    await this.client.sendMessage(
      chatId,
      `🔔 Comment veux-tu recevoir les offres ?\n\nFréquence actuelle : ${frequencyLabel(
        preferences.notificationFrequency,
      )}`,
      {
        replyMarkup: keyboard(
          FREQUENCY_CHOICES.map((choice) => [choice.label]),
        ),
      },
    );
  }

  private async handleFrequencyChoice(
    chatId: number,
    user: User,
    preferences: UserPreferences,
    text: string,
  ): Promise<void> {
    const choice = FREQUENCY_CHOICES.find(
      (candidate) => normalize(candidate.label) === normalize(text),
    );
    if (!choice) {
      await this.sendFrequencyPrompt(chatId, preferences);
      return;
    }

    const next = await updateUserPreferences(user.id, {
      notificationFrequency: choice.value,
      setupStep: "complete",
      configured: true,
    });
    await this.client.sendMessage(
      chatId,
      `✅ Ta recherche est configurée !\n\n${this.formatPreferences(
        next,
        user,
      )}\n\nUtilise /modifier à tout moment pour changer un critère.`,
      { replyMarkup: REMOVE_KEYBOARD },
    );
  }

  private async handleEditChoice(
    chatId: number,
    user: User,
    text: string,
  ): Promise<void> {
    const normalized = normalize(text);
    const steps: Array<[string, SetupStep]> = [
      ["💼 Métier", "job_sector"],
      ["📋 Contrats", "contract_types"],
      ["🌍 Pays", "countries"],
      ["📍 Lieux", "location_choice"],
      ["🎓 Niveau d'études", "education_level"],
      ["💰 Salaire minimum", "minimum_salary"],
      ["🏠 Télétravail", "remote_work"],
      ["🗣️ Langues", "languages"],
      ["📅 Date de début", "start_date"],
      ["🔔 Alertes", "notification_frequency"],
    ];
    const selected = steps.find(([label]) => normalize(label) === normalized);

    if (selected) {
      await this.beginEditing(chatId, user, selected[1]);
      return;
    }

    if (normalized === normalize("✅ Terminer")) {
      const preferences = await ensureUserPreferences(user.id);
      if (
        !preferences.jobSector ||
        preferences.contractTypes.length === 0 ||
        preferences.countries.length === 0
      ) {
        await this.client.sendMessage(
          chatId,
          "Il manque encore le métier, au moins un contrat ou un pays. Choisis une section pour terminer ta recherche.",
          { replyMarkup: keyboard([EDIT_CHOICES]) },
        );
        return;
      }

      const updatedPreferences = await updateUserPreferences(user.id, {
        configured: true,
        setupStep: "complete",
      });
      await this.client.sendMessage(
        chatId,
        `✅ Modifications enregistrées.\n\n${this.formatPreferences(
          updatedPreferences,
          user,
        )}`,
        { replyMarkup: REMOVE_KEYBOARD },
      );
      return;
    }

    await this.client.sendMessage(chatId, "Choisis une section à modifier.", {
      replyMarkup: keyboard([EDIT_CHOICES]),
    });
  }

  private async sendCurrentSetupPrompt(
    chatId: number,
    user: User,
    preferences: UserPreferences,
  ): Promise<void> {
    switch (preferences.setupStep as SetupStep) {
      case "job_sector":
        await this.client.sendMessage(
          chatId,
          "💼 Quel métier ou secteur recherches-tu ?\n\nÉcris-le librement, par exemple « Cybersécurité » ou « Développeur Python ».",
          { replyMarkup: REMOVE_KEYBOARD },
        );
        return;
      case "contract_types":
        await this.client.sendMessage(
          chatId,
          "📋 Quel type d'emploi recherches-tu ?\n\nTu peux sélectionner plusieurs choix, puis appuyer sur « ✅ Terminer ».",
          { replyMarkup: this.contractKeyboard(preferences.contractTypes) },
        );
        return;
      case "countries":
        await this.sendCountryPrompt(chatId, preferences);
        return;
      case "country_custom":
        await this.client.sendMessage(chatId, "Écris le nom d'un pays.", {
          replyMarkup: REMOVE_KEYBOARD,
        });
        return;
      case "location_choice":
        await this.sendLocationPrompt(chatId, preferences);
        return;
      case "location_custom":
      case "location_region":
        await this.client.sendMessage(
          chatId,
          "Écris le nom d'une ville ou d'une région.",
          { replyMarkup: REMOVE_KEYBOARD },
        );
        return;
      case "education_level":
        await this.sendEducationPrompt(chatId, preferences);
        return;
      case "minimum_salary":
        await this.sendMinimumSalaryPrompt(chatId, preferences);
        return;
      case "remote_work":
        await this.sendRemoteWorkPrompt(chatId, preferences);
        return;
      case "languages":
        await this.sendLanguagesPrompt(chatId, preferences);
        return;
      case "start_date":
        await this.sendStartDatePrompt(chatId, preferences);
        return;
      case "notification_frequency":
        await this.sendFrequencyPrompt(chatId, preferences);
        return;
      case "edit_menu":
        await this.client.sendMessage(chatId, "Que veux-tu modifier ?", {
          replyMarkup: keyboard([EDIT_CHOICES]),
        });
        return;
      case "complete":
        await this.client.sendMessage(
          chatId,
          `Ta recherche est déjà configurée.\n\n${this.formatPreferences(
            preferences,
            user,
          )}`,
          { replyMarkup: REMOVE_KEYBOARD },
        );
    }
  }

  private contractKeyboard(selected: string[]): TelegramReplyMarkup {
    return keyboard([
      ...CONTRACT_CHOICES.map((choice) => [
        selectedLabel(choice.label, selected.includes(choice.value)),
      ]),
      ["✅ Terminer"],
    ]);
  }

  private countryKeyboard(selected: string[]): TelegramReplyMarkup {
    return keyboard([
      ...COUNTRY_CHOICES.map((choice) => [
        selectedLabel(choice.label, selected.includes(choice.value)),
      ]),
      ["✏️ Choisir moi-même"],
      ["✅ Terminer"],
    ]);
  }

  private formatPreferences(preferences: UserPreferences, user: User): string {
    const status = user.stopped
      ? "arrêtées"
      : user.paused
        ? "en pause"
        : "actives";

    return `⚙️ MES PRÉFÉRENCES

💼 Métier :
${preferences.jobSector ?? "Non renseigné"}

📋 Contrat :
${listOrDefault(preferences.contractTypes, "Non renseigné")}

🌍 Pays :
${listOrDefault(preferences.countries, "Non renseigné")}

📍 Lieux :
${listOrDefault(preferences.locations, "Tout le pays")}

🎓 Niveau d'études :
${educationLabel(preferences.educationLevel)}

💰 Salaire minimum :
${preferences.minimumSalary === null ? "Non renseigné" : `${preferences.minimumSalary} €`}

🏠 Télétravail :
${remoteWorkLabel(preferences.remoteWork)}

🗣️ Langues :
${listOrDefault(preferences.languages, "Non renseignées")}

📅 Date de début :
${preferences.startDate ?? "Non renseignée"}

🔔 Alertes :
${frequencyLabel(preferences.notificationFrequency)}

🔔 Notifications : ${status}`;
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