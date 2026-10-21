-- 014: usage_records (usage and billing calculations)
CREATE TABLE usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  extension_id uuid REFERENCES extensions (id) ON DELETE SET NULL,
  call_record_id uuid REFERENCES call_records (id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('call_seconds', 'billable_seconds', 'calls_count')),
  quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'seconds' CHECK (unit IN ('seconds', 'count')),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, call_record_id, metric)
);

CREATE INDEX idx_usage_org_occurred ON usage_records (organisation_id, occurred_at DESC);
CREATE INDEX idx_usage_user ON usage_records (user_id, occurred_at DESC);
CREATE INDEX idx_usage_metric ON usage_records (organisation_id, metric, occurred_at DESC);
