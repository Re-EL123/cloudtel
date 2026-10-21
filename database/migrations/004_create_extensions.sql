-- 004: extensions (SIP extension metadata + provisioning state)
CREATE TABLE extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  number text NOT NULL CHECK (number ~ '^[0-9]{2,12}$'),
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 120),
  context text NOT NULL DEFAULT 'cloudtel-internal',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  provisioning_status text NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'provisioning', 'ready', 'failed', 'disabled')),
  provisioning_error text,
  pbx_endpoint_id text,
  provisioned_at timestamptz,
  max_concurrent_calls integer NOT NULL DEFAULT 2 CHECK (max_concurrent_calls BETWEEN 1 AND 20),
  allow_external boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_extensions_org_number ON extensions (organisation_id, number)
  WHERE status <> 'revoked';
CREATE INDEX idx_extensions_org_status ON extensions (organisation_id, status);
CREATE INDEX idx_extensions_user ON extensions (user_id);
CREATE INDEX idx_extensions_provisioning ON extensions (provisioning_status)
  WHERE provisioning_status IN ('pending', 'provisioning', 'failed');
