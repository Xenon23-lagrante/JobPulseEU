-- Migration: create source_statuses table (idempotent)
CREATE TABLE IF NOT EXISTS source_statuses (
  id serial PRIMARY KEY,
  source_id text NOT NULL,
  name text NOT NULL,
  country text,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unknown',
  reason text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_duration_ms integer,
  last_count_fetched integer,
  last_count_new integer,
  last_count_rejected integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS source_statuses_source_id_idx ON source_statuses(source_id);
