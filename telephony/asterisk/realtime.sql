-- CloudTel Asterisk Realtime / static provisioning notes
--
-- CloudTel is the source of truth for extensions. The recommended flow is:
--
--   1. A provisioning agent polls  GET /api/v1/extensions  (server-to-server,
--      using an API token) and reconciles PJSIP endpoints/aors/auths.
--   2. Passwords come from the extension's SIP credentials; never copy them
--      from this file. On rotation (POST /extensions/:id/rotate) the agent
--      updates the matching [auth<number>] section and reloads PJSIP.
--
-- Example reconciliation SQL for a psql_realtime layout (optional). If you use
-- static files (pjsip.conf), the agent rewrites the generated include instead.

-- Endpoints table (sorcery 'endpoint' object)
CREATE TABLE IF NOT EXISTS ps_endpoints (
  id            TEXT PRIMARY KEY,           -- extension number
  transport     TEXT,
  aors          TEXT,
  auth          TEXT,
  context       TEXT,
  disallow      TEXT,
  allow         TEXT,
  webrtc        TEXT DEFAULT 'yes',
  media_encryption TEXT DEFAULT 'dtls',
  dtls_setup    TEXT DEFAULT 'actpass',
  direct_media  TEXT DEFAULT 'no',
  callerid      TEXT
);

-- AORs
CREATE TABLE IF NOT EXISTS ps_aors (
  id                 TEXT PRIMARY KEY,
  max_contacts       INTEGER DEFAULT 1,
  remove_existing    TEXT DEFAULT 'yes',
  qualify_frequency  INTEGER DEFAULT 30
);

-- Auths
CREATE TABLE IF NOT EXISTS ps_auths (
  id        TEXT PRIMARY KEY,
  auth_type TEXT DEFAULT 'userpass',
  username  TEXT,
  password  TEXT
);
