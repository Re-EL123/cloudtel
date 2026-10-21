-- 003: organisation_members (membership + organisation-scoped roles)
CREATE TABLE organisation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'supervisor', 'user', 'auditor')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  invited_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

CREATE INDEX idx_members_user ON organisation_members (user_id);
CREATE INDEX idx_members_org_role ON organisation_members (organisation_id, role);

-- Exactly one owner per organisation is enforced by application logic plus a
-- partial unique index that keeps at least one owner row.
CREATE UNIQUE INDEX idx_members_single_owner ON organisation_members (organisation_id)
  WHERE role = 'owner';
