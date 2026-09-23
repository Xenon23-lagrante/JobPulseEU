-- Initial schema for Job Pulse Alerts
-- Creates users, user_preferences, jobs, job_notifications

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  telegram_id bigint NOT NULL,
  username text,
  first_name text,
  paused boolean NOT NULL DEFAULT false,
  stopped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_idx ON users(telegram_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_sector text,
  contract_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  countries text[] NOT NULL DEFAULT ARRAY[]::text[],
  locations text[] NOT NULL DEFAULT ARRAY[]::text[],
  education_level text,
  minimum_salary integer,
  remote_work text,
  languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  start_date date,
  notification_frequency text NOT NULL DEFAULT 'immediate',
  setup_step text NOT NULL DEFAULT 'job_sector',
  configured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences(user_id);

CREATE TABLE IF NOT EXISTS jobs (
  id serial PRIMARY KEY,
  source text NOT NULL,
  source_job_id text NOT NULL,
  title text NOT NULL,
  company text,
  description text,
  url text NOT NULL,
  country text NOT NULL,
  region text,
  city text,
  contract_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  education_level text,
  salary_min integer,
  salary_max integer,
  salary_currency text,
  remote_work text,
  languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  start_date date,
  published_at timestamptz,
  expires_at timestamptz,
  raw_data jsonb NOT NULL DEFAULT '{}',
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_source_job_id_idx ON jobs(source, source_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_fingerprint_idx ON jobs(fingerprint);
CREATE INDEX IF NOT EXISTS jobs_source_idx ON jobs(source);
CREATE INDEX IF NOT EXISTS jobs_published_at_idx ON jobs(published_at);
CREATE INDEX IF NOT EXISTS jobs_country_idx ON jobs(country);
CREATE INDEX IF NOT EXISTS jobs_contract_types_idx ON jobs USING gin (contract_types);

CREATE TABLE IF NOT EXISTS job_notifications (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  notification_type text NOT NULL DEFAULT 'immediate'
);
CREATE UNIQUE INDEX IF NOT EXISTS job_notifications_user_job_idx ON job_notifications(user_id, job_id);
CREATE INDEX IF NOT EXISTS job_notifications_user_sent_at_idx ON job_notifications(user_id, sent_at);
CREATE INDEX IF NOT EXISTS job_notifications_notification_type_idx ON job_notifications(notification_type);
