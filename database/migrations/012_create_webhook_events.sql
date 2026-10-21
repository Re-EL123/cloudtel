-- 012: webhook_events (deduplication and processing status)
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('telephony', 'billing')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL DEFAULT '' CHECK (char_length(event_type) <= 64),
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  signature text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'rejected')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (source, provider_event_id)
);

CREATE INDEX idx_webhook_events_received ON webhook_events (received_at DESC);
CREATE INDEX idx_webhook_events_status ON webhook_events (source, status);
