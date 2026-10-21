-- 005: contacts (personal and organisation-wide)
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'organisation'
    CHECK (scope IN ('personal', 'organisation')),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80),
  company text NOT NULL DEFAULT '' CHECK (char_length(company) <= 120),
  department text NOT NULL DEFAULT '' CHECK (char_length(department) <= 120),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 32),
  phone2 text NOT NULL DEFAULT '' CHECK (char_length(phone2) <= 32),
  phone_normalized text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '' CHECK (char_length(email) <= 254),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope = 'organisation' OR owner_user_id IS NOT NULL),
  CHECK (char_length(phone) > 0 OR char_length(phone2) > 0)
);

CREATE INDEX idx_contacts_org ON contacts (organisation_id);
CREATE INDEX idx_contacts_owner ON contacts (owner_user_id);
CREATE INDEX idx_contacts_phone_norm ON contacts (organisation_id, phone_normalized);
CREATE INDEX idx_contacts_name ON contacts (organisation_id, lower(full_name));
CREATE INDEX idx_contacts_recent ON contacts (organisation_id, updated_at DESC);
