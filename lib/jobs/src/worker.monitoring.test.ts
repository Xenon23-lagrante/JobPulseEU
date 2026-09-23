import assert from "node:assert/strict";
import test from "node:test";

import { runWorkerOnce } from "./worker.js";

test("worker persists per-source status after run", async () => {
  const calls: any[] = [];

  const mockSource: any = {
    id: "mock-src",
    name: "Mock Source",
    country: "FR",
    status: "connected",
    health: "healthy",
    reason: null,
    lastRunAt: null,
    lastDurationMs: null,
    lastCountFetched: null,
    lastCountNew: null,
    lastErrorCount: null,
    get connected() {
      return this.status === "connected";
    },
    async fetchJobs() {
      return [
        {
          source: "mock",
          sourceJobId: "1",
          title: "T1",
          url: "https://example.com/1",
          country: "FR",
          fingerprint: "f1",
          rawData: {},
        },
      ];
    },
    recordRun(stats: any) {
      this.lastRunAt = new Date();
      this.lastDurationMs = stats.durationMs;
      this.lastCountFetched = stats.fetched;
      this.lastCountNew = stats.added;
      this.lastErrorCount = stats.errors;
    },
  };

  const upsertFn = async (jobs: any[]) => {
    return jobs.map((j, i) => ({ ...(j as any), id: i + 1 }));
  };

  const dbMock = {
    selectUsers: async () => [],
    upsertSourceStatus: async (input: any) => {
      calls.push({ upsert: input });
      return input;
    },
    updateSourceRunStatus: async (sourceId: string, stats: any) => {
      calls.push({ update: sourceId, stats });
      return stats;
    },
    addPendingUserJobNotification: async () => false,
  };

  const telegramFactory = async () => ({ sendMessage: async () => {} });

  await runWorkerOnce({ sources: [mockSource], upsertFn, skipLock: true, db: dbMock, telegramClientFactory: telegramFactory });

  assert.ok(calls.find((c) => c.upsert && c.upsert.sourceId === "mock-src" || c.update && c.update === "mock-src"), "Expected DB upsert/update called for source");
});
