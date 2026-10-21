# Database

PostgreSQL is the single source of truth. Schema changes are made **only**
through numbered migrations; the consolidated `database/schema.sql` is generated
from them and must never be hand-edited independently.

## Migrations

```
database/migrations/
  001_create_organisations.sql
  002_create_users.sql
  003_create_organisation_members.sql
  004_create_extensions.sql
  005_create_contacts.sql
  006_create_call_records.sql
  007_create_call_events.sql
  008_create_sessions.sql
  009_create_password_reset_tokens.sql
  010_create_user_settings.sql
  011_create_audit_logs.sql
  012_create_webhook_events.sql
  013_create_subscriptions.sql
  014_create_usage_records.sql
  015_create_rate_limit_counters.sql
  016_create_contact_favourites.sql
```

Applied versions are tracked in `schema_migrations(version, applied_at)`.
Migrations are forward-only and idempotent via that table.

```bash
export DATABASE_URL=postgres://user:password@localhost:5432/cloudtel
npm run db:migrate              # apply pending migrations in order
npm run db:migrate -- --dry-run # show what would run
npm run db:seed                 # development seed data
```

Or manually: `psql "$DATABASE_URL" -f database/schema.sql` then
`psql "$DATABASE_URL" -f database/seeds/development.sql`.

## Tables

| Table | Purpose | Tenant key |
| --- | --- | --- |
| `organisations` | tenants | `id` |
| `users` | accounts (global, not tenant-owned) | — |
| `organisation_members` | user ↔ org with `role`, `status` | `organisation_id` |
| `extensions` | SIP extensions + PBX provisioning state | `organisation_id` |
| `contacts` | personal + organisation address book | `organisation_id` |
| `contact_favourites` | per-user favourite contacts | `organisation_id` |
| `call_records` | call history (duration ≠ billable) | `organisation_id` |
| `call_events` | raw webhook events, dedupe key | `organisation_id` |
| `sessions` | DB-backed login sessions | (user) |
| `password_reset_tokens` | one-time reset tokens (hashed) | (user) |
| `user_settings` | per-user preferences (JSON) | (user) |
| `audit_logs` | admin/security action trail | `organisation_id` |
| `webhook_events` | provider webhook dedupe | nullable |
| `subscriptions` | billing plan per org | `organisation_id` |
| `usage_records` | billing source of truth (metrics) | `organisation_id` |
| `rate_limit_counters` | fixed-window rate limits | — |

## Rules

- **Multi-tenant isolation**: every tenant-owned row has `organisation_id` and
  every query filters on it. There is no cross-tenant read path except for
  platform admins.
- **Timestamps** are stored UTC (`timestamptz`); display uses the user timezone
  (default `Africa/Johannesburg`).
- **Billing** is derived from `usage_records` written from PBX webhooks, never
  from the browser's call timer. `call_records.duration_seconds` and
  `call_records.billable_seconds` are distinct.
- **Secrets**: SIP passwords are stored server-side and never returned to the
  browser; password/reset values are hashed.
- **Idempotency**: `call_events` has a uniqueness constraint on
  `(organisation_id, provider_call_id, event_type, occurred_at)`; usage rows use
  `ON CONFLICT (organisation_id, call_record_id, metric) DO UPDATE`.

## Indexes

Each foreign key and common filter column is indexed, including:
`organisations.slug`, `users.email` (unique, case-insensitive),
`extensions.organisation_id`, `extensions.number`,
`contacts.organisation_id`, `call_records (organisation_id, started_at DESC)`,
`usage_records (organisation_id, occurred_at)`, `audit_logs (organisation_id,
created_at DESC)`, and `contact_favourites (user_id, contact_id)`.

## Development seed

`database/seeds/development.sql` creates two organisations, five users
(password `CloudTel!Demo2026`), four extensions, contacts, call history, usage
rows, and subscriptions. See [troubleshooting.md](./troubleshooting.md) for
credentials. The seed refuses to run when `NODE_ENV=production`.
