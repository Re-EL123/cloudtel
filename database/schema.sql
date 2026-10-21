-- CloudTel consolidated PostgreSQL schema.
-- Generated from database/migrations/*.sql - do not edit by hand.
-- Apply with: npm run db:migrate (preferred) or psql -f database/schema.sql

-- =========================================================
-- 001_create_organisations.sql
-- =========================================================
-- 001: organisations (business accounts / tenants)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  default_timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_organisations_status ON organisations (status);

-- =========================================================
-- 002_create_users.sql
-- =========================================================
-- 002: users (global user profiles)
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  password_hash text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited', 'deactivated')),
  is_platform_admin boolean NOT NULL DEFAULT false,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email_unique ON users (lower(email));
CREATE INDEX idx_users_status ON users (status);

-- =========================================================
-- 003_create_organisation_members.sql
-- =========================================================
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

-- =========================================================
-- 004_create_extensions.sql
-- =========================================================
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

-- =========================================================
-- 005_create_contacts.sql
-- =========================================================
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

-- =========================================================
-- 006_create_call_records.sql
-- =========================================================
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

-- =========================================================
-- 007_create_call_events.sql
-- =========================================================
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

-- =========================================================
-- 008_create_sessions.sql
-- =========================================================
-- 008: sessions (database-backed HTTP-only session store)
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
CREATE INDEX idx_sessions_org ON sessions (organisation_id);

-- =========================================================
-- 009_create_password_reset_tokens.sql
-- =========================================================
-- 009: password_reset_tokens (secure password recovery)
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX idx_reset_tokens_expires ON password_reset_tokens (expires_at);

-- =========================================================
-- 010_create_user_settings.sql
-- =========================================================
-- 010: user_settings (per-user preferences)
CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations (id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_settings_org ON user_settings (organisation_id);

-- =========================================================
-- 011_create_audit_logs.sql
-- =========================================================
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

-- =========================================================
-- 012_create_webhook_events.sql
-- =========================================================
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

-- =========================================================
-- 013_create_subscriptions.sql
-- =========================================================
-- 013: subscriptions (plan and entitlements; one row per organisation)
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL UNIQUE REFERENCES organisations (id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial' CHECK (char_length(plan) <= 40),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_customer_id text,
  period_start timestamptz,
  period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_status ON subscriptions (status);

-- =========================================================
-- 014_create_usage_records.sql
-- =========================================================
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

-- =========================================================
-- 015_create_rate_limit_counters.sql
-- =========================================================
-- 015: rate_limit_counters (durable request counters for serverless instances)
CREATE TABLE rate_limit_counters (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_rate_limit_expires ON rate_limit_counters (expires_at);

-- =========================================================
-- 016_create_contact_favourites.sql
-- =========================================================
-- 016: contact_favourites (per-user favourite contacts)
CREATE TABLE contact_favourites (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, contact_id)
);

CREATE INDEX idx_contact_favourites_user ON contact_favourites (user_id, organisation_id);
CREATE INDEX idx_contact_favourites_contact ON contact_favourites (contact_id);

CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
