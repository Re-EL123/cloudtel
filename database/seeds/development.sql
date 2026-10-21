-- CloudTel development seed data.
-- Password for every seeded account: CloudTel!Demo2026
-- Never run this file against a production database.

-- Tenants ---------------------------------------------------------------
INSERT INTO organisations (id, name, slug, status, default_timezone) VALUES
  ('11111111-1111-4111-8111-111111111111', 'CloudTel Demo', 'cloudtel-demo', 'active', 'Africa/Johannesburg'),
  ('22222222-2222-4222-8222-222222222222', 'Acme Corporation', 'acme-corp', 'active', 'Africa/Johannesburg')
ON CONFLICT (id) DO NOTHING;

-- Users -----------------------------------------------------------------
-- scrypt hash of "CloudTel!Demo2026" (N=16384,r=8,p=1)
INSERT INTO users (id, email, name, password_hash, status, is_platform_admin) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@demo.cloudtel.test',  'Dineo Mokoena', 'scrypt$N=16384,r=8,p=1$D6P0wwlPBls5j6GpaxdDqg==$oV59zooarbov+TEmfCaNgFGGS7w7YBB4Cgmrcr07atAh09FJQ/1GmkZbHV/W61O/7Aqa7HU9pStp68+wvS71vw==', 'active', false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'admin@demo.cloudtel.test',  'Thabo Nkosi',    'scrypt$N=16384,r=8,p=1$D6P0wwlPBls5j6GpaxdDqg==$oV59zooarbov+TEmfCaNgFGGS7w7YBB4Cgmrcr07atAh09FJQ/1GmkZbHV/W61O/7Aqa7HU9pStp68+wvS71vw==', 'active', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'agent@demo.cloudtel.test',  'Lerato Dlamini', 'scrypt$N=16384,r=8,p=1$D6P0wwlPBls5j6GpaxdDqg==$oV59zooarbov+TEmfCaNgFGGS7w7YBB4Cgmrcr07atAh09FJQ/1GmkZbHV/W61O/7Aqa7HU9pStp68+wvS71vw==', 'active', false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'owner@acme.cloudtel.test',  'Sipho Mahlangu', 'scrypt$N=16384,r=8,p=1$D6P0wwlPBls5j6GpaxdDqg==$oV59zooarbov+TEmfCaNgFGGS7w7YBB4Cgmrcr07atAh09FJQ/1GmkZbHV/W61O/7Aqa7HU9pStp68+wvS71vw==', 'active', false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'platform@cloudtel.test',   'CloudTel Platform', 'scrypt$N=16384,r=8,p=1$D6P0wwlPBls5j6GpaxdDqg==$oV59zooarbov+TEmfCaNgFGGS7w7YBB4Cgmrcr07atAh09FJQ/1GmkZbHV/W61O/7Aqa7HU9pStp68+wvS71vw==', 'active', true)
ON CONFLICT (id) DO NOTHING;

-- Memberships -----------------------------------------------------------
INSERT INTO organisation_members (organisation_id, user_id, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'admin'),
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'user'),
  ('22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'owner')
ON CONFLICT (organisation_id, user_id) DO NOTHING;

-- Extensions (marked ready for local UI work; PBX provisioning is separate) --
INSERT INTO extensions (id, organisation_id, user_id, number, display_name, status, provisioning_status, provisioned_at) VALUES
  ('e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1001', 'Dineo Mokoena', 'active', 'ready', now()),
  ('e0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '1002', 'Thabo Nkosi', 'active', 'ready', now()),
  ('e0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '1003', 'Lerato Dlamini', 'active', 'ready', now()),
  ('e0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '2001', 'Sipho Mahlangu', 'active', 'ready', now())
ON CONFLICT (id) DO NOTHING;

-- Subscriptions ---------------------------------------------------------
INSERT INTO subscriptions (organisation_id, plan, status, period_start, period_end) VALUES
  ('11111111-1111-4111-8111-111111111111', 'standard', 'active', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'),
  ('22222222-2222-4222-8222-222222222222', 'trial', 'trialing', now(), now() + interval '14 days')
ON CONFLICT (organisation_id) DO NOTHING;

-- Contacts --------------------------------------------------------------
INSERT INTO contacts (organisation_id, owner_user_id, scope, full_name, display_name, company, department, phone, phone_normalized, email) VALUES
  ('11111111-1111-4111-8111-111111111111', NULL, 'organisation', 'Reception Desk', 'Reception', 'CloudTel Demo', 'Front Office', '011 555 0100', '+27115550100', 'reception@demo.cloudtel.test'),
  ('11111111-1111-4111-8111-111111111111', NULL, 'organisation', 'Kagiso Petersen', 'Kagiso', 'CloudTel Demo', 'Sales', '082 555 0199', '+27825550199', 'kagiso@demo.cloudtel.test'),
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'personal', 'Naledi Smith', 'Naledi', '独立顾问', 'Consulting', '083 555 0111', '+27835550111', 'naledi@example.test')
ON CONFLICT DO NOTHING;

-- Demo call history (older than "now" so the history screen has content) ----
INSERT INTO call_records (organisation_id, user_id, extension_id, provider_call_id, direction, caller_number, callee_number, caller_name, started_at, answered_at, ended_at, duration_seconds, billable_seconds, disposition, source) VALUES
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'e0000000-0000-4000-8000-000000000003', 'seed-call-0001', 'outgoing', '1003', '+27825550199', '', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours 4 minutes', 244, 250, 'answered', 'pbx'),
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'e0000000-0000-4000-8000-000000000003', 'seed-call-0002', 'incoming', '+27115550100', '1003', 'Reception Desk', now() - interval '5 hours', NULL, now() - interval '5 hours', 0, 0, 'missed', 'pbx'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'e0000000-0000-4000-8000-000000000001', 'seed-call-0003', 'outgoing', '1001', '1002', '', now() - interval '1 day', now() - interval '1 day', now() - interval '1 day 12 minutes', 725, 725, 'answered', 'pbx'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'e0000000-0000-4000-8000-000000000002', 'seed-call-0004', 'incoming', '+27835550111', '1002', 'Naledi Smith', now() - interval '2 days', NULL, now() - interval '2 days', 0, 0, 'declined', 'pbx'),
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'e0000000-0000-4000-8000-000000000003', 'seed-call-0005', 'outgoing', '1003', '+27115550100', '', now() - interval '3 days', NULL, now() - interval '3 days', 0, 0, 'voicemail', 'pbx')
ON CONFLICT (organisation_id, provider_call_id) WHERE provider_call_id IS NOT NULL DO NOTHING;

-- Usage rows matching the seeded calls ------------------------------------
INSERT INTO usage_records (organisation_id, user_id, extension_id, call_record_id, metric, quantity, unit, occurred_at)
SELECT organisation_id, user_id, extension_id, id, 'call_seconds', duration_seconds, 'seconds', ended_at
  FROM call_records WHERE provider_call_id LIKE 'seed-call-%'
ON CONFLICT (organisation_id, call_record_id, metric) DO NOTHING;

INSERT INTO usage_records (organisation_id, user_id, extension_id, call_record_id, metric, quantity, unit, occurred_at)
SELECT organisation_id, user_id, extension_id, id, 'billable_seconds', billable_seconds, 'seconds', ended_at
  FROM call_records WHERE provider_call_id LIKE 'seed-call-%'
ON CONFLICT (organisation_id, call_record_id, metric) DO NOTHING;

INSERT INTO usage_records (organisation_id, user_id, extension_id, call_record_id, metric, quantity, unit, occurred_at)
SELECT organisation_id, user_id, extension_id, id, 'calls_count', 1, 'count', ended_at
  FROM call_records WHERE provider_call_id LIKE 'seed-call-%'
ON CONFLICT (organisation_id, call_record_id, metric) DO NOTHING;

-- Audit trail sample -----------------------------------------------------
INSERT INTO audit_logs (organisation_id, user_id, action, resource_type, resource_id, metadata) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'seed.applied', 'system', 'development', '{"note":"development seed data"}');
