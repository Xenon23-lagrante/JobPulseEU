import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
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

export const jobsTable = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    sourceJobId: text("source_job_id").notNull(),
    title: text("title").notNull(),
    company: text("company"),
    description: text("description"),
    url: text("url").notNull(),
    country: text("country").notNull(),
    region: text("region"),
    city: text("city"),
    contractTypes: text("contract_types")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    educationLevel: text("education_level"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    remoteWork: text("remote_work"),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    startDate: date("start_date", { mode: "string" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rawData: jsonb("raw_data").notNull().default(sql`'{}'::jsonb`),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceSourceJobIdIdx: uniqueIndex("jobs_source_source_job_id_idx").on(
      table.source,
      table.sourceJobId,
    ),
    fingerprintIdx: uniqueIndex("jobs_fingerprint_idx").on(table.fingerprint),
    sourceIdx: index("jobs_source_idx").on(table.source),
    publishedAtIdx: index("jobs_published_at_idx").on(table.publishedAt),
    countryIdx: index("jobs_country_idx").on(table.country),
    contractTypesIdx: index("jobs_contract_types_idx").using(
      "gin",
      table.contractTypes,
    ),
  }),
);

export const jobNotificationsTable = pgTable(
  "job_notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notificationType: text("notification_type").notNull().default("immediate"),
  },
  (table) => ({
    userJobIdx: uniqueIndex("job_notifications_user_job_idx").on(
      table.userId,
      table.jobId,
    ),
    userSentAtIdx: index("job_notifications_user_sent_at_idx").on(
      table.userId,
      table.sentAt,
    ),
    notificationTypeIdx: index("job_notifications_notification_type_idx").on(
      table.notificationType,
    ),
  }),
);

export const sourceStatusesTable = pgTable(
  "source_statuses",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    country: text("country"),
    enabled: boolean("enabled").notNull().default(false),
    status: text("status").notNull().default("unknown"),
    reason: text("reason"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastDurationMs: integer("last_duration_ms"),
    lastCountFetched: integer("last_count_fetched"),
    lastCountNew: integer("last_count_new"),
    lastCountRejected: integer("last_count_rejected"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceIdIdx: uniqueIndex("source_statuses_source_id_idx").on(table.sourceId),
  }),
);

export const usersRelations = relations(usersTable, ({ one, many }) => ({
  preferences: one(userPreferencesTable),
  notifications: many(jobNotificationsTable),
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

export const jobsRelations = relations(jobsTable, ({ many }) => ({
  notifications: many(jobNotificationsTable),
}));

export const jobNotificationsRelations = relations(
  jobNotificationsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [jobNotificationsTable.userId],
      references: [usersTable.id],
    }),
    job: one(jobsTable, {
      fields: [jobNotificationsTable.jobId],
      references: [jobsTable.id],
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
export type Job = typeof jobsTable.$inferSelect;
export type JobInsert = typeof jobsTable.$inferInsert;
export type JobNotification = typeof jobNotificationsTable.$inferSelect;
export type JobNotificationInsert = typeof jobNotificationsTable.$inferInsert;