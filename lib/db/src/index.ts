import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  jobNotificationsTable,
  jobsTable,
  userPreferencesTable,
  usersTable,
  type Job,
  type JobInsert,
  type JobNotification,
  type User,
  type UserPreferences,
  type UserPreferencesUpdate,
} from "./schema";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null as any;

function assertDb() {
  if (!db) {
    throw new Error(
      "DATABASE_URL is not set — database operations are unavailable in this environment. Set DATABASE_URL to use DB features.",
    );
  }
}

export * from "./schema";

export async function upsertTelegramUser(input: {
  telegramId: number;
  username?: string;
  firstName?: string;
}): Promise<User> {
  assertDb();
  const [user] = await db
    .insert(usersTable)
    .values({
      telegramId: input.telegramId,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
    })
    .onConflictDoUpdate({
      target: usersTable.telegramId,
      set: {
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!user) {
    throw new Error(`Unable to save Telegram user ${input.telegramId}`);
  }

  return user;
}

export async function ensureUserPreferences(
  userId: number,
): Promise<UserPreferences> {
  assertDb();
  const [preferences] = await db
    .insert(userPreferencesTable)
    .values({ userId })
    .onConflictDoNothing({ target: userPreferencesTable.userId })
    .returning();

  if (preferences) {
    return preferences;
  }

  const existing = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);

  if (!existing[0]) {
    throw new Error(`Unable to load preferences for user ${userId}`);
  }

  return existing[0];
}

export async function updateUserPreferences(
  userId: number,
  changes: UserPreferencesUpdate,
): Promise<UserPreferences> {
  assertDb();
  const [preferences] = await db
    .update(userPreferencesTable)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(userPreferencesTable.userId, userId))
    .returning();

  if (!preferences) {
    throw new Error(`Unable to update preferences for user ${userId}`);
  }

  return preferences;
}

export async function updateUserNotificationState(
  userId: number,
  changes: Pick<User, "paused" | "stopped">,
): Promise<User> {
  assertDb();
  const [user] = await db
    .update(usersTable)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!user) {
    throw new Error(`Unable to update notification state for user ${userId}`);
  }

  return user;
}

export async function upsertJob(input: JobInsert): Promise<Job> {
  assertDb();
  const [job] = await db
    .insert(jobsTable)
    .values(input)
    .onConflictDoUpdate({
      target: [jobsTable.source, jobsTable.sourceJobId],
      set: {
        ...input,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!job) {
    throw new Error(
      `Unable to upsert job ${input.source}:${input.sourceJobId ?? "unknown"}`,
    );
  }

  return job;
}

export async function hasJobBeenNotified(
  userId: number,
  jobId: number,
): Promise<boolean> {
  assertDb();
  const [notification] = await db
    .select()
    .from(jobNotificationsTable)
    .where(and(eq(jobNotificationsTable.userId, userId), eq(jobNotificationsTable.jobId, jobId)))
    .limit(1);

  return Boolean(notification);
}

export async function recordUserJobNotification(
  userId: number,
  jobId: number,
  notificationType: string = "immediate",
): Promise<JobNotification> {
  assertDb();
  const [notification] = await db
    .insert(jobNotificationsTable)
    .values({ userId, jobId, notificationType })
    .onConflictDoNothing({
      target: [jobNotificationsTable.userId, jobNotificationsTable.jobId],
    })
    .returning();

  // return the inserted notification row, or null if it already existed
  return (notification as JobNotification) ?? null;
}

export async function addPendingUserJobNotification(
  userId: number,
  jobId: number,
  frequency: string,
): Promise<boolean> {
  assertDb();
  const notificationType = `pending:${frequency}`;
  const [notification] = await db
    .insert(jobNotificationsTable)
    .values({ userId, jobId, notificationType })
    .onConflictDoNothing({ target: [jobNotificationsTable.userId, jobNotificationsTable.jobId] })
    .returning();

  return Boolean(notification);
}

export async function getPendingNotificationsByFrequency(frequency: string) {
  assertDb();
  const notificationType = `pending:${frequency}`;
  const rows = await db
    .select()
    .from(jobNotificationsTable)
    .where(eq(jobNotificationsTable.notificationType, notificationType));

  return rows as JobNotification[];
}

export async function markPendingNotificationsSent(userId: number, jobIds: number[], frequency: string) {
  assertDb();
  const notificationType = `pending:${frequency}`;
  const updated = await db
    .update(jobNotificationsTable)
    .set({ notificationType: `sent:${frequency}`, sentAt: new Date() })
    .where(and(eq(jobNotificationsTable.userId, userId), jobNotificationsTable.jobId.in(jobIds), eq(jobNotificationsTable.notificationType, notificationType)))
    .returning();

  return updated;
}

export async function upsertSourceStatus(input: {
  sourceId: string;
  name: string;
  country?: string | null;
  enabled: boolean;
  status: string;
  reason?: string | null;
}) {
  assertDb();
  const [row] = await db
    .insert(schema.sourceStatusesTable)
    .values({
      sourceId: input.sourceId,
      name: input.name,
      country: input.country ?? null,
      enabled: input.enabled,
      status: input.status,
      reason: input.reason ?? null,
    })
    .onConflictDoUpdate({
      target: schema.sourceStatusesTable.sourceId,
      set: {
        name: input.name,
        country: input.country ?? null,
        enabled: input.enabled,
        status: input.status,
        reason: input.reason ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function updateSourceRunStatus(sourceId: string, stats: {
  lastRunAt?: Date | null;
  lastSuccessAt?: Date | null;
  lastErrorAt?: Date | null;
  lastDurationMs?: number | null;
  lastCountFetched?: number | null;
  lastCountNew?: number | null;
  lastCountRejected?: number | null;
  status?: string;
  reason?: string | null;
}) {
  assertDb();
  const setObj: any = { updatedAt: new Date() };
  if (stats.lastRunAt !== undefined) setObj.lastRunAt = stats.lastRunAt;
  if (stats.lastSuccessAt !== undefined) setObj.lastSuccessAt = stats.lastSuccessAt;
  if (stats.lastErrorAt !== undefined) setObj.lastErrorAt = stats.lastErrorAt;
  if (stats.lastDurationMs !== undefined) setObj.lastDurationMs = stats.lastDurationMs;
  if (stats.lastCountFetched !== undefined) setObj.lastCountFetched = stats.lastCountFetched;
  if (stats.lastCountNew !== undefined) setObj.lastCountNew = stats.lastCountNew;
  if (stats.lastCountRejected !== undefined) setObj.lastCountRejected = stats.lastCountRejected;
  if (stats.status !== undefined) setObj.status = stats.status;
  if (stats.reason !== undefined) setObj.reason = stats.reason;

  const [updated] = await db
    .update(schema.sourceStatusesTable)
    .set(setObj)
    .where(eq(schema.sourceStatusesTable.sourceId, sourceId))
    .returning();

  return updated;
}

export async function selectAllSourceStatuses() {
  const rows = await db.select().from(schema.sourceStatusesTable).orderBy(schema.sourceStatusesTable.sourceId.asc);
  return rows;
}
