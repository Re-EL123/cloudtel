-- 016: contact_favourites (per-user favourite contacts)
-- A favourite is a user-scoped marker on an organisation contact. Keeping this
-- as a join table (rather than a column on contacts) means each user can
-- favourite shared organisation contacts independently.

CREATE TABLE contact_favourites (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id)
);

CREATE INDEX idx_contact_favourites_user ON contact_favourites (user_id, organisation_id);
CREATE INDEX idx_contact_favourites_contact ON contact_favourites (contact_id);
