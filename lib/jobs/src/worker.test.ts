import test from "node:test";
import assert from "node:assert/strict";

import { runWorkerOnce } from "./worker.js";

test("worker sends notification and records it", async () => {
  let recorded = false;
  let sentMessages: Array<{ chatId: number; text: string }> = [];

  const fakeSource = {
    id: "mock",
    name: "mock",
    country: "fr",
    connected: true,
    status: "connected",
    health: "healthy",
    lastRunAt: null,
    fetchJobs: async () => [
      {
        id: 11,
        source: "mock",
        sourceJobId: "1",
        title: "Test Job",
        url: "https://example.com/1",
        country: "fr",
        contractTypes: ["permanent"],
        languages: ["fr"],
        createdAt: new Date(),
        updatedAt: new Date(),
        fingerprint: "f1",
        rawData: {},
      },
    ],
    recordRun: () => {},
  } as any;

  const fakeUpsert = async (jobs: any[]) => {
    return jobs.map((j, idx) => ({ ...j, id: 101 + idx }));
  };

  const fakeDb = {
    selectUsers: async () => [
      { id: 1, telegramId: 999, preferences: { countries: ["fr"], contractTypes: ["permanent"], languages: ["fr"] }, paused: false, stopped: false },
    ],
    hasJobBeenNotified: async () => false,
    recordUserJobNotification: async (userId: number, jobId: number) => {
      recorded = true;
      return { id: 1, userId, jobId };
    },
  };

  const fakeTelegramFactory = (_token: string) => ({
    sendMessage: async (chatId: number, text: string) => {
      sentMessages.push({ chatId, text });
      return { message_id: 1 };
    },
  });

  await runWorkerOnce({
    sources: [fakeSource],
    upsertFn: fakeUpsert,
    db: fakeDb as any,
    telegramClientFactory: fakeTelegramFactory,
    skipLock: true,
  });

  assert.equal(recorded, true);
  assert.equal(sentMessages.length, 1);
  assert.ok(sentMessages[0].text.includes("Test Job"));
});

test("worker skips when already running (in-memory)", async () => {
  // Start a long running runWorkerOnce that doesn't finish quickly
  let resolveFn: () => void;
  const p = new Promise<void>((res) => (resolveFn = res));

  const fakeSource = { id: "s", connected: true, health: "healthy", fetchJobs: async () => { await p; return []; }, recordRun: () => {} } as any;

  // start first run
  const first = runWorkerOnce({ sources: [fakeSource], upsertFn: async () => [], db: { selectUsers: async () => [] }, telegramClientFactory: () => ({ sendMessage: async () => {} }), skipLock: true });

  // immediate second invocation should detect in-memory running and return
  await runWorkerOnce({ sources: [fakeSource], upsertFn: async () => [], db: { selectUsers: async () => [] }, telegramClientFactory: () => ({ sendMessage: async () => {} }), skipLock: true });

  // finish first
  resolveFn!();
  await first;
});
