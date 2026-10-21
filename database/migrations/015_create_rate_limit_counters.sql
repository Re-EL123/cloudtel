-- 015: rate_limit_counters (durable request counters for serverless instances)
CREATE TABLE rate_limit_counters (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_rate_limit_expires ON rate_limit_counters (expires_at);
