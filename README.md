# CloudTel

A browser-based VoIP softphone and business communications platform.
**By Re-EL Branding & Technologies.**

CloudTel lets teams make and receive calls from the browser — no desktop client.
It combines a live calling interface with contacts, call history, user and
extension management, and platform administration, on a secure multi-tenant
backend.

> Product identity note: this repository implements the "Re-EL Softphone"
> specification under the **CloudTel** product name. See `AGENTS.md`.

## Features

- **Softphone** — register over secure WebSocket, place/receive/answer/hangup,
  hold, mute, transfer, and DTMF.
- **Contacts** — personal and organisation address books, search, favourites.
- **Call history** — filtering, statistics, CSV export, voicemail.
- **Settings** — profile, security, audio devices, notifications, telephony.
- **Organisations & teams** — members, roles, extensions, invitations.
- **Admin** — dashboard, usage, audit log, user suspension, extension revoke.
- **Billing-ready** — plans, usage records, provider-agnostic checkout.
- **PWA** — installable, offline shell, service worker.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | Static HTML5 + CSS3 + ES modules (no build step) — GitHub Pages or Vercel |
| API | Vercel Serverless Functions (Node ≥ 20, `pg` only) |
| Database | PostgreSQL |
| Telephony | SIP.js, WebRTC, Asterisk (ARI) |
| Shared code | `packages/shared`, `packages/ui` (mirrored into the web app) |

## Repository layout

```
apps/
  web/            static SPA (HTML, CSS, ES modules, service worker)
  api/            12 serverless functions + shared server libraries
packages/
  shared/         constants, roles, permissions, validation, call status
  ui/             framework-free UI primitives
database/         migrations, consolidated schema, development seeds
telephony/        Asterisk config examples + ARI → webhook bridge
scripts/          build, migrate, seed, validate, checks
docs/             architecture, api-reference, database, security, …
tests/            unit, api integration, tenant security
```

## Quick start

```bash
# 1. install
npm install

# 2. configure + prepare the database
cp .env.example .env
export DATABASE_URL=postgres://user:password@localhost:5432/cloudtel
npm run db:migrate
npm run db:seed

# 3. sync shared packages into the web app
npm run build

# 4. serve the frontend (static) and API
npm run dev:web            # http://localhost:3000
npm run dev:api            # http://localhost:3001 (Vercel dev)
```

Development logins (seed data, password `CloudTel!Demo2026`):

| Email | Role |
| --- | --- |
| `owner@demo.cloudtel.test` | owner |
| `admin@demo.cloudtel.test` | admin |
| `agent@demo.cloudtel.test` | user |
| `platform@cloudtel.test` | platform admin |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | sync `packages/*` mirrors into `apps/web` |
| `npm run check:functions` | enforce the 12-function ceiling |
| `npm run lint` | ESLint across workspaces |
| `npm run test:unit` | unit tests (no database) |
| `npm run test:integration` | API integration tests (needs `DATABASE_URL`) |
| `npm run test:security` | tenant-isolation tests (needs `DATABASE_URL`) |
| `npm run validate` | sync + ceiling + syntax + lint + unit tests |
| `npm run db:migrate` / `db:seed` | database setup |
| `npm run generate:icons` / `generate:pages` | regenerate assets/pages |

## GitHub Pages + separate API

The frontend can run on GitHub Pages at a custom domain (e.g.
`cloudtel.re-el.co.za`, root path) with the API on a separate host. Set
`apps/web/config.json` (or inject via `.github/workflows/pages.yml` using repo
variables) with `apiBaseUrl` pointing to the absolute API base. The SPA uses
runtime config loading (`assets/js/core/config.js`), sends credentials with
cross-origin requests, and falls back to session-response CSRF tokens when
cookies are not readable. Add the Pages origin to the API's `CORS_ORIGINS`.
`CNAME` and `.nojekyll` live in `apps/web`. See
[docs/deployment.md](./docs/deployment.md).

- **Exactly 12 serverless functions** (hard spec ceiling). Each is a catch-all
  route group; new endpoints are added inside the group, never as new files.
- **Multi-tenant**: every tenant row carries `organisation_id`; every query is
  org-scoped. Cross-tenant access returns `404`.
- **One API envelope**: `{ success, data|error, meta.requestId }`.
- **One API client**: only `core/api-client.js` calls `fetch()`; only
  `telephony/` touches SIP.js; only `audio.js` uses `getUserMedia`.
- **Billing truth** comes from PBX usage records, never the browser timer.

See [docs/architecture.md](./docs/architecture.md).

## Documentation

- [Architecture](./docs/architecture.md)
- [API reference](./docs/api-reference.md)
- [Database](./docs/database.md)
- [Security](./docs/security.md)
- [Deployment](./docs/deployment.md)
- [Telephony](./docs/telephony.md)
- [Design system](./docs/design-system.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Disaster recovery](./docs/disaster-recovery.md)

## Security

Report vulnerabilities privately to the maintainers. Never commit secrets, SIP
passwords, or PBX credentials. See [docs/security.md](./docs/security.md).

## Licence

See [LICENSE](./LICENSE).
