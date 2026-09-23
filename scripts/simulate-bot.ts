import { JobAlertBot } from "../artifacts/api-server/src/telegram/bot";

type Sent = { chatId: number; text: string }[];

async function run() {
  const sent: Sent = [];

  // Mock Telegram client to capture sendMessage calls
  const mockClient = {
    getMe: async () => ({ id: 999, is_bot: true, first_name: "bot", username: "jobalert" }),
    getUpdates: async () => [],
    sendMessage: async (chatId: number, text: string) => {
      sent.push({ chatId, text });
      return { message_id: Math.floor(Math.random() * 1000), chat: { id: chatId, type: "private" }, text };
    },
  } as any;

  // Simple in-memory mock DB
  const users: Record<number, any> = {};
  const jobs: any[] = [
    { id: 1, title: "Alternance Cybersécurité Paris", source: "mock", publishedAt: new Date(), company: "Acme" , sourceJobId: "1"},
    { id: 2, title: "Alternance Cybersécurité Bruxelles", source: "mock", publishedAt: new Date(), company: "Beta" , sourceJobId: "2"},
    { id: 3, title: "Alternance Réseaux Berlin", source: "mock", publishedAt: new Date(), company: "Gamma" , sourceJobId: "3"},
  ];

  const mockDb = {
    upsertTelegramUser: async ({ telegramId, username, firstName }: any) => {
      if (!users[telegramId]) {
        users[telegramId] = { id: Object.keys(users).length + 1, telegramId, username, firstName, paused: false, stopped: false };
      }
      return users[telegramId];
    },
    ensureUserPreferences: async (userId: number) => {
      const u = Object.values(users).find((x: any) => x.id === userId);
      if (!u.preferences) {
        u.preferences = { configured: false, setupStep: "job_sector", contractTypes: [], countries: [], locations: [], jobSector: null };
      }
      return u.preferences;
    },
    updateUserPreferences: async (userId: number, changes: any) => {
      const u = Object.values(users).find((x: any) => x.id === userId);
      u.preferences = { ...(u.preferences || {}), ...changes };
      return u.preferences;
    },
    updateUserNotificationState: async (userId: number, changes: any) => {
      const u = Object.values(users).find((x: any) => x.id === userId);
      Object.assign(u, changes);
      return u;
    },
    hasJobBeenNotified: async () => false,
    selectAllSourceStatuses: async () => [{ sourceId: "mock", name: "Mock Source", country: "FR", enabled: true, status: "ok", lastRunAt: new Date() }],
    // expose jobs so bot /offres path can read them if it imports db directly
    __jobs: jobs,
  };

  const bot = new JobAlertBot("FAKE_TOKEN", { db: mockDb });
  // replace internal client with mock
  (bot as any).client = mockClient;

  // helper to simulate an incoming message
  async function sendMessageFrom(telegramId: number, username: string | undefined, text: string) {
    const update = {
      update_id: Math.floor(Math.random() * 100000),
      message: {
        message_id: Math.floor(Math.random() * 1000),
        chat: { id: telegramId, type: "private" },
        text,
        from: { id: telegramId, is_bot: false, first_name: username ?? "user", username },
      },
    } as any;

    await (bot as any).handleUpdate(update);
  }

  // Simulate users A, B, C
  // User A: cybersécurité, alternance, France
  await sendMessageFrom(1001, "userA", "/start");
  await sendMessageFrom(1001, "userA", "Cybersécurité");
  await sendMessageFrom(1001, "userA", "🔄 Alternance");
  await sendMessageFrom(1001, "userA", "🇫🇷 France");
  await sendMessageFrom(1001, "userA", "✅ Terminer");

  // Mark as configured
  const ua = users[1001];
  ua.preferences.configured = true;
  ua.preferences.jobSector = "Cybersécurité";
  ua.preferences.contractTypes = ["Alternance"];
  ua.preferences.countries = ["France"];

  // User B: cybersécurité alternance Belgique+Lux
  await sendMessageFrom(1002, "userB", "/start");
  const ub = await mockDb.upsertTelegramUser({ telegramId: 1002, username: "userB" });
  ub.preferences = { configured: true, jobSector: "Cybersécurité", contractTypes: ["Alternance"], countries: ["Belgique", "Luxembourg"] };

  // User C: réseaux alternance toute l'Europe
  await sendMessageFrom(1003, "userC", "/start");
  const uc = await mockDb.upsertTelegramUser({ telegramId: 1003, username: "userC" });
  uc.preferences = { configured: true, jobSector: "Réseaux", contractTypes: ["Alternance"], countries: ["Toute l'Europe"] };

  // Simulate /offres for each user
  await sendMessageFrom(1001, "userA", "/offres");
  await sendMessageFrom(1002, "userB", "/offres");
  await sendMessageFrom(1003, "userC", "/offres");

  console.log("Sent messages:");
  for (const s of sent) console.log(s.chatId, s.text.slice(0, 120).replace(/\n/g, " "));
}

run().catch((e) => { console.error(e); process.exit(1); });
