-- 007: call_events (processed call lifecycle events)
CREATE TABLE call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  call_record_id uuid REFERENCES call_records (id) ON DELETE CASCADE,
  provider_call_id text NOT NULL,
  event_type text NOT NULL CHECK (char_length(event_type) <= 64),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  processing_error text
);

CREATE UNIQUE INDEX idx_call_events_dedupe
  ON call_events (organisation_id, provider_call_id, event_type, occurred_at);
CREATE INDEX idx_call_events_record ON call_events (call_record_id);
CREATE INDEX idx_call_events_org_occurred ON call_events (organisation_id, occurred_at DESC);
CREATE INDEX idx_call_events_unprocessed ON call_events (received_at) WHERE processed = false;
