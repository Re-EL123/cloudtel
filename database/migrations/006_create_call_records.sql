-- 006: call_records (normalised call history)
CREATE TABLE call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  extension_id uuid REFERENCES extensions (id) ON DELETE SET NULL,
  provider_call_id text,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  caller_number text NOT NULL DEFAULT '' CHECK (char_length(caller_number) <= 32),
  callee_number text NOT NULL DEFAULT '' CHECK (char_length(callee_number) <= 32),
  caller_name text NOT NULL DEFAULT '' CHECK (char_length(caller_name) <= 120),
  started_at timestamptz NOT NULL,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  billable_seconds integer NOT NULL DEFAULT 0 CHECK (billable_seconds >= 0),
  disposition text NOT NULL
    CHECK (disposition IN ('answered', 'missed', 'declined', 'busy', 'failed', 'cancelled', 'no_answer', 'voicemail')),
  hangup_cause text,
  source text NOT NULL DEFAULT 'pbx' CHECK (source IN ('browser', 'pbx', 'provider', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (answered_at IS NULL OR answered_at >= started_at),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Provider/PBX correlation prevents duplicate call rows.
CREATE UNIQUE INDEX idx_call_records_provider
  ON call_records (organisation_id, provider_call_id)
  WHERE provider_call_id IS NOT NULL;

CREATE INDEX idx_call_records_org_started ON call_records (organisation_id, started_at DESC);
CREATE INDEX idx_call_records_user_started ON call_records (user_id, started_at DESC);
CREATE INDEX idx_call_records_extension ON call_records (extension_id);
CREATE INDEX idx_call_records_direction ON call_records (organisation_id, direction);
CREATE INDEX idx_call_records_disposition ON call_records (organisation_id, disposition);
CREATE INDEX idx_call_records_caller ON call_records (organisation_id, caller_number);
CREATE INDEX idx_call_records_callee ON call_records (organisation_id, callee_number);
