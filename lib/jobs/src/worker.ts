import { defaultJobSources } from "./sources/index.js";
import { upsertJobsFromSource } from "./services/jobs.js";
import { matchJobToPreferences } from "./services/matching.js";
import type { Job } from "./types.js";

// Telegram client will be imported lazily to allow tests to run without the artifact build

const LOCK_KEY = 1234567890; // advisory lock key for single-worker guarantee
let inMemoryRunning = false;
let schedulerId: NodeJS.Timeout | null = null;
const lastSent: Record<string, Date | null> = {
  daily: null,
  twice_daily_8: null,
  twice_daily_20: null,
  weekly: null,
};

function logger(...args: unknown[]) {
  // lightweight logging to avoid adding new deps
  // include timestamp
  // eslint-disable-next-line no-console
  console.info(new Date().toISOString(), "[worker]", ...args);
}

async function tryAcquireLock(poolParam?: any): Promise<boolean> {
  if (!poolParam) return true; // in-memory or test mode
  try {
    const res = await poolParam.query("SELECT pg_try_advisory_lock($1) as locked", [LOCK_KEY]);
    return res.rows?.[0]?.locked === true;
  } catch (err) {
    logger("lock-acquire-failed", err);
    return false;
  }
}

async function releaseLock(poolParam?: any): Promise<void> {
  if (!poolParam) return;
  try {
    await poolParam.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  } catch (err) {
    logger("lock-release-failed", err);
  }
}

function formatJobMessage(job: Job) {
  const lines: string[] = [];
  lines.push(`✳️ ${job.title}`);
  if (job.company) lines.push(`🏢 ${job.company}`);
  lines.push(`📍 ${[job.city, job.region, job.country].filter(Boolean).join(", ")}`);
  if (job.salaryMin) lines.push(`💶 ${job.salaryMin}${job.salaryCurrency ? ` ${job.salaryCurrency}` : ""}`);
  lines.push(`🔗 ${job.url}`);
  return lines.join("\n");
}

export async function runWorkerOnce(options?: {
  telegramToken?: string | undefined;
  maxPerSource?: number;
  // dependency injection for testing
  pool?: any;
  db?: any;
  upsertFn?: (jobs: any[]) => Promise<any[]>;
  sources?: any[];
  telegramClientFactory?: (token: string) => any;
  skipLock?: boolean;
}) {
  if (inMemoryRunning) {
    logger("already-running-in-memory");
    return;
  }

  inMemoryRunning = true;

  const poolParam = options?.pool;
  const lock = options?.skipLock ? true : await tryAcquireLock(poolParam);
  if (!lock) {
    logger("could-not-acquire-db-lock, another worker may be running");
    inMemoryRunning = false;
    return;
  }

  const telegramToken = options?.telegramToken ?? process.env.TELEGRAM_BOT_TOKEN;
  const upsertFn = options?.upsertFn ?? upsertJobsFromSource;
  const sources = options?.sources ?? defaultJobSources;
  const telegramFactory = options?.telegramClientFactory ?? (async (t: string) => {
    const mod = await import("../../../../artifacts/api-server/src/telegram/client.js");
    return new mod.TelegramClient(t);
  });

  // DB helpers (lazy import if not injected)
  const dbModule = options?.db ?? (await import("@workspace/db").catch(() => null));

  async function localFetchInterestedUsers() {
    if (options?.db && options.db.selectUsers) return options.db.selectUsers();
    const { eq } = await import("drizzle-orm");
    const rows = await dbModule.db.select().from(dbModule.usersTable).innerJoin(dbModule.userPreferencesTable, (jc: any) => eq(jc.userId, dbModule.usersTable.id)).where(dbModule.usersTable.paused.eq(false)).where(dbModule.usersTable.stopped.eq(false));
    return rows.map((r: any) => ({ id: r.id as number, telegramId: Number(r.telegramId), preferences: r.user_preferences as any, paused: Boolean(r.paused), stopped: Boolean(r.stopped) }));
  }

  async function localHasBeenNotified(userId: number, jobId: number) {
    if (options?.db && options.db.hasJobBeenNotified) return options.db.hasJobBeenNotified(userId, jobId);
    return dbModule.hasJobBeenNotified(userId, jobId);
  }

  async function localRecordNotification(userId: number, jobId: number) {
    if (options?.db && options.db.recordUserJobNotification) return options.db.recordUserJobNotification(userId, jobId, "immediate");
    return dbModule.recordUserJobNotification(userId, jobId, "immediate");
  }

  try {
    const users = await localFetchInterestedUsers();

    for (const source of sources) {
      if (!source.connected || source.health === "disabled") {
        logger("skipping-source", source.id, source.status);
        continue;
      }

      logger("processing-source", source.id);
      const start = Date.now();
      let fetched = 0;
      let added = 0;
      let errors = 0;

      try {
        const rawJobs = await source.fetchJobs({ since: source.lastRunAt ?? undefined });
        fetched = rawJobs.length;
        const jobs = rawJobs.slice(0, options?.maxPerSource ?? rawJobs.length);

        const persisted = await upsertFn(jobs);
        added = persisted.length;

        for (const job of persisted) {
          for (const user of users) {
            try {
              const match = matchJobToPreferences(job as Job, user.preferences);
              if (match.outcome === "no_match" || match.outcome === "insufficient") continue;

              const already = await localHasBeenNotified(user.id, (job as any).id as number);
              if (already) continue;

              const frequency = user.preferences?.notificationFrequency ?? "immediate";
              if (frequency === "immediate") {
                const message = formatJobMessage(job as Job);
                try {
                  const client = await telegramFactory(telegramToken ?? "");
                  await client.sendMessage(user.telegramId, message);
                  try {
                    await localRecordNotification(user.id, (job as any).id as number);
                  } catch (recErr) {
                    logger("record-notification-failed", recErr);
                  }
                } catch (sendErr) {
                  logger("send-notification-failed", sendErr, { user: user.id, job: (job as any).id });
                }
              } else {
                // Deferred notification: record pending entry for the user's frequency
                try {
                  if (options?.db && options.db.addPendingUserJobNotification) {
                    await options.db.addPendingUserJobNotification(user.id, (job as any).id as number, frequency);
                  } else if (dbModule && dbModule.addPendingUserJobNotification) {
                    await dbModule.addPendingUserJobNotification(user.id, (job as any).id as number, frequency);
                  } else {
                    // fallback: record immediate to avoid duplicate sends
                    await localRecordNotification(user.id, (job as any).id as number);
                  }
                } catch (pendingErr) {
                  logger("pending-record-failed", pendingErr);
                }
              }
            } catch (userErr) {
              logger("user-match-error", userErr, { user: user.id });
            }
          }
        }
      } catch (err) {
        errors += 1;
        logger("source-error", source.id, err);
        source.reason = String((err as Error).message ?? err);
        source.health = "error";
      } finally {
        try {
          source.recordRun({ durationMs: Date.now() - start, fetched, added, errors });
        } catch (rec) {
          logger("record-run-failed", rec);
        }

        // persist source status to DB and emit structured log
        try {
          const statusPayload = {
            sourceId: source.id,
            name: source.name,
            country: (source as any).country ?? null,
            enabled: source.connected,
            status: source.health,
            reason: source.reason ?? null,
            lastRunAt: source.lastRunAt ?? null,
            lastDurationMs: source.lastDurationMs ?? null,
            lastCountFetched: source.lastCountFetched ?? null,
            lastCountNew: source.lastCountNew ?? null,
            lastErrorCount: source.lastErrorCount ?? null,
          };

          // structured log (redacts sensitive keys)
          try {
            const mod = await import("@workspace/logging").catch(() => null);
            if (mod && mod.log) mod.log("info", "source-run-complete", statusPayload);
          } catch (logErr) {
            // swallow logging errors
          }

          // write to DB if available
          if (options?.db && options.db.upsertSourceStatus) {
            await options.db.upsertSourceStatus({
              sourceId: source.id,
              name: source.name,
              country: (source as any).country ?? null,
              enabled: source.connected,
              status: source.health,
              reason: source.reason ?? null,
            });
            await options.db.updateSourceRunStatus(source.id, {
              lastRunAt: source.lastRunAt ?? new Date(),
              lastDurationMs: source.lastDurationMs ?? null,
              lastCountFetched: source.lastCountFetched ?? null,
              lastCountNew: source.lastCountNew ?? null,
              lastCountRejected: source.lastErrorCount ?? null,
              status: source.health,
              reason: source.reason ?? null,
              lastSuccessAt: source.lastErrorCount && source.lastErrorCount > 0 ? null : source.lastRunAt ?? null,
              lastErrorAt: source.lastErrorCount && source.lastErrorCount > 0 ? source.lastRunAt ?? new Date() : null,
            });
          } else if (dbModule && dbModule.upsertSourceStatus) {
            await dbModule.upsertSourceStatus({
              sourceId: source.id,
              name: source.name,
              country: (source as any).country ?? null,
              enabled: source.connected,
              status: source.health,
              reason: source.reason ?? null,
            });
            await dbModule.updateSourceRunStatus(source.id, {
              lastRunAt: source.lastRunAt ?? new Date(),
              lastDurationMs: source.lastDurationMs ?? null,
              lastCountFetched: source.lastCountFetched ?? null,
              lastCountNew: source.lastCountNew ?? null,
              lastCountRejected: source.lastErrorCount ?? null,
              status: source.health,
              reason: source.reason ?? null,
              lastSuccessAt: source.lastErrorCount && source.lastErrorCount > 0 ? null : source.lastRunAt ?? null,
              lastErrorAt: source.lastErrorCount && source.lastErrorCount > 0 ? source.lastRunAt ?? new Date() : null,
            });
          }
        } catch (persistErr) {
          logger("persist-source-status-failed", persistErr, { source: source.id });
        }
      }
    }
  } finally {
    await releaseLock(poolParam);
    inMemoryRunning = false;
  }
}

// Process pending notifications for a given frequency (e.g., 'daily', 'twice_daily', 'weekly')
export async function processPendingNotifications(frequency: string, options?: { db?: any; telegramToken?: string; telegramClientFactory?: any }) {
  const dbModule = options?.db ?? (await import("@workspace/db").catch(() => null));
  if (!dbModule || !dbModule.getPendingNotificationsByFrequency) {
    logger("no-db-module-for-pending");
    return;
  }

  const pending = await dbModule.getPendingNotificationsByFrequency(frequency);
  if (!pending || pending.length === 0) return;

  // group by userId
  const groups = new Map<number, number[]>();
  for (const p of pending) {
    const uid = (p.userId as unknown) as number;
    const jid = (p.jobId as unknown) as number;
    const arr = groups.get(uid) ?? [];
    arr.push(jid);
    groups.set(uid, arr);
  }

  for (const [userId, jobIds] of groups.entries()) {
    try {
      // fetch user and preferences
      const { eq } = await import("drizzle-orm");
      const db = dbModule.db;
      const [userRow] = await db.select().from(dbModule.usersTable).where(eq(dbModule.usersTable.id, userId)).limit(1);
      if (!userRow) continue;
      if (userRow.paused || userRow.stopped) continue;

      const prefsRow = await db.select().from(dbModule.userPreferencesTable).where(eq(dbModule.userPreferencesTable.userId, userId)).limit(1);
      const prefs = prefsRow?.[0] ?? null;
      if (!prefs || !prefs.configured) continue;

      // fetch jobs
      const jobs = await db.select().from(dbModule.jobsTable).where(dbModule.jobsTable.id.in(jobIds)).limit(100);

      if (!jobs || jobs.length === 0) continue;

      // format grouped message
      const formattedJobs = jobs.map((j: any) => {
        const parts: string[] = [];
        if (j.title) parts.push(`💼 ${j.title}`);
        if (j.company) parts.push(`🏢 ${j.company}`);
        const loc = [j.city, j.country].filter(Boolean).join(", ");
        if (loc) parts.push(`📍 ${loc}`);
        if (j.contractTypes && j.contractTypes.length > 0) parts.push(`📄 ${j.contractTypes.join(", ")}`);
        if (j.educationLevel) parts.push(`🎓 ${j.educationLevel}`);
        if (j.salaryMin) parts.push(`💰 ${j.salaryMin}${j.salaryCurrency ? ` ${j.salaryCurrency}` : ""}`);
        if (j.remoteWork) parts.push(`🏠 ${j.remoteWork}`);
        if (j.languages && j.languages.length > 0) parts.push(`🗣️ ${j.languages.join(", ")}`);
        parts.push(`🔗 ${j.url}`);
        return parts.join("\n");
      });

      const message = `🔔 Nouvelle offre\n\n${formattedJobs.slice(0, 10).join("\n\n")}`;

      // send
      const telegramFactory = options?.telegramClientFactory ?? (async (t: string) => {
        const mod = await import("../../../../artifacts/api-server/src/telegram/client.js");
        return new mod.TelegramClient(t);
      });
      const client = await telegramFactory(options?.telegramToken ?? process.env.TELEGRAM_BOT_TOKEN ?? "");
      await client.sendMessage(Number(userRow.telegramId), message);

      // mark sent
      await dbModule.markPendingNotificationsSent(userId, jobIds, frequency);
    } catch (err) {
      logger("process-pending-error", err, { userId, frequency });
    }
  }
}

export function startScheduler(intervalMs?: number, opts?: { telegramToken?: string }) {
  const ms = intervalMs ?? Number(process.env.JOB_WORKER_INTERVAL_MS ?? 5 * 60 * 1000);
  if (schedulerId) return;
  schedulerId = setInterval(() => {
    void (async () => {
      try {
        await runWorkerOnce({ telegramToken: opts?.telegramToken });

        // check deferred frequencies
        const now = new Date();
        const hour = now.getHours();

        // daily at 08:00
        if (hour === 8) {
          const today = new Date();
          if (!lastSent.daily || lastSent.daily.toDateString() !== today.toDateString()) {
            await processPendingNotifications("daily", { telegramToken: opts?.telegramToken });
            lastSent.daily = new Date();
          }
        }

        // twice daily at 08:00 and 20:00
        if (hour === 8) {
          const today = new Date();
          if (!lastSent.twice_daily_8 || lastSent.twice_daily_8.toDateString() !== today.toDateString()) {
            await processPendingNotifications("twice_daily", { telegramToken: opts?.telegramToken });
            lastSent.twice_daily_8 = new Date();
          }
        }
        if (hour === 20) {
          const today = new Date();
          if (!lastSent.twice_daily_20 || lastSent.twice_daily_20.toDateString() !== today.toDateString()) {
            await processPendingNotifications("twice_daily", { telegramToken: opts?.telegramToken });
            lastSent.twice_daily_20 = new Date();
          }
        }

        // weekly on Monday at 08:00
        if (hour === 8 && now.getDay() === 1) {
          const weekKey = `${now.getFullYear()}-${getWeekNumber(now)}`;
          const last = lastSent.weekly;
          const lastKey = last ? `${last.getFullYear()}-${getWeekNumber(last)}` : null;
          if (lastKey !== weekKey) {
            await processPendingNotifications("weekly", { telegramToken: opts?.telegramToken });
            lastSent.weekly = new Date();
          }
        }
      } catch (err) {
        logger("scheduler-cycle-error", err);
      }
    })();
  }, ms);
  logger("scheduler-started", { intervalMs: ms });
}

export function stopScheduler() {
  if (!schedulerId) return;
  clearInterval(schedulerId);
  schedulerId = null;
  logger("scheduler-stopped");
}

export default { runWorkerOnce, startScheduler, stopScheduler };

function getWeekNumber(d: Date) {
  // ISO week number
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}
