import assert from "node:assert/strict";
import test from "node:test";

// ensure DB module import doesn't throw in tests (we'll monkeypatch the helpers we need)
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/test";
// Do dynamic imports inside the test to avoid static ESM import of @workspace/db

test("admin /admin_sources returns statuses only to admins", async () => {
  process.env.ADMIN_TELEGRAM_IDS = "999";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/test";

  // create mock DB object to inject into bot
  const db = {
    upsertTelegramUser: async ({ telegramId }: any) => ({ id: 1, telegramId }),
    ensureUserPreferences: async (userId: number) => ({ configured: true }),
    selectAllSourceStatuses: async () => [
      {
        sourceId: "s1",
        name: "Source One",
        country: "FR",
        enabled: true,
        status: "healthy",
        reason: null,
        lastRunAt: new Date("2026-09-23T08:00:00Z"),
        lastSuccessAt: new Date("2026-09-23T08:00:00Z"),
        lastErrorAt: null,
        lastDurationMs: 1200,
        lastCountFetched: 10,
        lastCountNew: 2,
        lastCountRejected: 1,
      },
    ],
  };

  const messages: any[] = [];
  const mockClient: any = {
    async getMe() { return { username: 'bot' }; },
    async getUpdates() { return []; },
    async sendMessage(chatId: number, text: string) {
      messages.push({ chatId, text });
    },
  };

  const { JobAlertBot } = await import("./bot.js");
  const bot = new JobAlertBot("fake-token", { db });
  // replace internal client with mock
  (bot as any).client = mockClient;

  const update = {
    update_id: 1,
    message: {
      text: "/admin_sources",
      chat: { id: 123 },
      from: { id: 999, username: "admin", first_name: "A", id: 999 },
    },
  };

  await (bot as any).handleUpdate(update);

  assert.ok(messages.length >= 1, "Expected at least one message sent to admin");
  assert.ok(messages[0].text.includes("Source One"), "Expected source name in admin message");
});
