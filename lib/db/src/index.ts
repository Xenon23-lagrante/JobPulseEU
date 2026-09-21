import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import {
  userPreferencesTable,
  usersTable,
  type User,
  type UserPreferences,
  type UserPreferencesUpdate,
} from "./schema";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

export async function upsertTelegramUser(input: {
  telegramId: number;
  username?: string;
  firstName?: string;
}): Promise<User> {
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
