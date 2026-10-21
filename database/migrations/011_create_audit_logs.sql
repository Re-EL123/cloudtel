-- 011: audit_logs (security and administrative events)
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 64),
  resource_type text NOT NULL DEFAULT '' CHECK (char_length(resource_type) <= 64),
  resource_id text NOT NULL DEFAULT '' CHECK (char_length(resource_id) <= 64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NOT NULL DEFAULT '',
  request_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_org_created ON audit_logs (organisation_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs (organisation_id, action);
CREATE INDEX idx_audit_resource ON audit_logs (resource_type, resource_id);
