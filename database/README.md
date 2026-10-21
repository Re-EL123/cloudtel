# CloudTel database

PostgreSQL schema, versioned migrations and development seed data.

## Layout

```text
database/
├── schema.sql          # consolidated schema (generated from migrations)
├── migrations/         # numbered, forward-only migrations
└── seeds/
    └── development.sql # demo tenant, users, extensions, contacts, call history
```

## Rules

- Schema changes are **only** made through a new numbered migration
  (`016_create_something.sql`). Never edit an applied migration.
- `schema.sql` is regenerated from the migrations; edit the migrations, not the
  consolidated file.
- Seed scripts are for development. Never run them against production
  (`scripts/seed.mjs` refuses to run when `NODE_ENV=production`).
- All tenant-owned tables carry `organisation_id`; every query must filter on it.
- Timestamps are stored in UTC (`timestamptz`).

## Applying migrations

```bash
export DATABASE_URL=postgres://user:password@localhost:5432/cloudtel
npm run db:migrate          # apply pending migrations in order
npm run db:migrate -- --dry-run
npm run db:seed             # development seed data
```

Or manually:

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seeds/development.sql
```

## Development accounts

The seed creates these accounts (password `CloudTel!Demo2026`):

| Email | Role | Organisation |
|---|---|---|
| owner@demo.cloudtel.test | owner | CloudTel Demo |
| admin@demo.cloudtel.test | admin | CloudTel Demo |
| agent@demo.cloudtel.test | user | CloudTel Demo |
| owner@acme.cloudtel.test | owner | Acme Corporation |
| platform@cloudtel.test | platform administrator | - |

`Acme Corporation` exists so tenant-isolation tests have a second organisation.

## Tables

| Table | Purpose |
|---|---|
| `organisations` | business accounts (tenants) |
| `users` | global user profiles |
| `organisation_members` | membership + organisation-scoped roles |
| `extensions` | SIP extension metadata + provisioning state |
| `contacts` | personal and organisation contacts |
| `call_records` | normalised call history |
| `call_events` | processed call lifecycle events |
| `user_settings` | per-user preferences |
| `sessions` | database-backed session store |
| `password_reset_tokens` | password recovery |
| `audit_logs` | security and administrative events |
| `webhook_events` | webhook deduplication and processing status |
| `subscriptions` | plan and entitlements |
| `usage_records` | usage and billing calculations |
| `rate_limit_counters` | durable rate-limit counters |
