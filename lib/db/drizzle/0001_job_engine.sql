CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_job_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  description TEXT,
  url TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  contract_types TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  education_level TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  remote_work TEXT,
  languages TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  start_date DATE,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_source_job_id_idx
  ON jobs (source, source_job_id);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_fingerprint_idx
  ON jobs (fingerprint);

CREATE INDEX IF NOT EXISTS jobs_source_idx
  ON jobs (source);

CREATE INDEX IF NOT EXISTS jobs_published_at_idx
  ON jobs (published_at);

CREATE INDEX IF NOT EXISTS jobs_country_idx
  ON jobs (country);

CREATE INDEX IF NOT EXISTS jobs_contract_types_idx
  ON jobs USING GIN (contract_types);

CREATE TABLE IF NOT EXISTS job_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notification_type TEXT NOT NULL DEFAULT 'immediate'
);

CREATE UNIQUE INDEX IF NOT EXISTS job_notifications_user_job_idx
  ON job_notifications (user_id, job_id);

CREATE INDEX IF NOT EXISTS job_notifications_user_sent_at_idx
  ON job_notifications (user_id, sent_at);

CREATE INDEX IF NOT EXISTS job_notifications_notification_type_idx
  ON job_notifications (notification_type);
