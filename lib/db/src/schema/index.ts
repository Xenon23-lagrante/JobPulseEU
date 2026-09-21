import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    username: text("username"),
    firstName: text("first_name"),
    paused: boolean("paused").notNull().default(false),
    stopped: boolean("stopped").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    telegramIdIndex: uniqueIndex("users_telegram_id_idx").on(table.telegramId),
  }),
);

export const userPreferencesTable = pgTable(
  "user_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    jobSector: text("job_sector"),
    contractTypes: text("contract_types")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    countries: text("countries")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    locations: text("locations")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    educationLevel: text("education_level"),
    minimumSalary: integer("minimum_salary"),
    remoteWork: text("remote_work"),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    startDate: date("start_date", { mode: "string" }),
    notificationFrequency: text("notification_frequency")
      .notNull()
      .default("immediate"),
    setupStep: text("setup_step").notNull().default("job_sector"),
    configured: boolean("configured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIndex: uniqueIndex("user_preferences_user_id_idx").on(table.userId),
  }),
);

export const usersRelations = relations(usersTable, ({ one }) => ({
  preferences: one(userPreferencesTable),
}));

export const userPreferencesRelations = relations(
  userPreferencesTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [userPreferencesTable.userId],
      references: [usersTable.id],
    }),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type UserPreferences = typeof userPreferencesTable.$inferSelect;
export type UserPreferencesUpdate = Partial<
  Omit<
    typeof userPreferencesTable.$inferInsert,
    "id" | "userId" | "createdAt" | "updatedAt"
  >
 >;