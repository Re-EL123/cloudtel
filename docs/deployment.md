# Deployment

CloudTel can be deployed in two topologies:

1. **All on Vercel** — frontend SPA in `apps/web` and JSON API in `apps/api` as two
   Vercel projects (recommended for a single-origin deploy).
2. **Static frontend on GitHub Pages + separate API** — serve `apps/web` from
   GitHub Pages at `cloudtel.re-el.co.za` (custom domain, root path) and host the
   API on a separate host (e.g. Vercel, Railway, Render). The frontend loads its
   API base at runtime from `config.json` (no rebuild required).

## Topology (Vercel, same-origin or subdomains)

| Project | Root directory | What it serves |
| --- | --- | --- |
| `cloudtel-web` | `apps/web` | static SPA (HTML/CSS/JS, service worker) |
| `cloudtel-api` | `apps/api` | 12 serverless functions under `/api/v1` |

## Topology (GitHub Pages + separate API)

| Host | What it serves | Notes |
| --- | --- | --- |
| GitHub Pages (`cloudtel.re-el.co.za`) | static SPA from `apps/web` | Custom domain at root. Publish via `.github/workflows/pages.yml`. Set repo variable `API_BASE_URL` to the absolute API base (e.g. `https://api.example.com/api/v1`). Requires `CNAME` and `.nojekyll` in `apps/web`. |
| API host | 12 serverless functions under `/api/v1` | Must allow credentialed cross-origin requests from `https://cloudtel.re-el.co.za` via `CORS_ORIGINS`. Sessions use `HttpOnly` cookies; the SPA sends them with `credentials: "include"`. CSRF tokens are delivered in session responses for cross-origin frontends. |

The database is any managed PostgreSQL 14+ (Vercel Postgres, Neon, RDS…). The
PBX is Asterisk with ARI enabled; the `ari-bridge` service runs wherever it can
reach both ARI and the API.

## Environment variables

Set on the **API** project:

```
NODE_ENV=production
APP_URL=https://app.cloudtel.example
DATABASE_URL=postgres://…
PG_SSL=require
SESSION_TTL_HOURS=12
CORS_ORIGINS=https://app.cloudtel.example

PBX_API_BASE_URL=https://pbx.internal/api
PBX_API_USERNAME=…
PBX_API_PASSWORD=…
SIP_DOMAIN=pbx.cloudtel.example
SIP_WSS_URL=wss://pbx.cloudtel.example:8089/ws
SIP_TRANSPORT=WSS
SIP_VOICEMAIL_CODE=*97

TELEPHONY_WEBHOOK_SECRET=…
BILLING_WEBHOOK_SECRET=…
BILLING_PROVIDER=
```

Set on the **web** project (public values only): for GitHub Pages the API base
URL is injected into `apps/web/config.json` at deploy time via the workflow
(repo variable `API_BASE_URL`). For Vercel or a single-origin deploy you can
also edit `apps/web/config.json` (same-origin `"/api/v1"` keeps the existing
setup working). Runtime loading is handled by `apps/web/assets/js/core/config.js`.
The SPA sends `credentials: "include"` for cross-origin APIs.

Set on the **ari-bridge** host: see `telephony/ari-bridge/.env.example`.

> Never put SIP passwords, PBX credentials, or webhook secrets in the web
> project — everything served to the browser is public.

## Deploy steps

```bash
# 1. database
DATABASE_URL=… npm run db:migrate        # apply migrations (never seed prod)

# 2. api
cd apps/api && vercel --prod

# 3. web
cd apps/web && vercel --prod

# 4. bridge
cd telephony/ari-bridge && npm ci && npm start   # run under a process manager
```

## Function limits

`apps/api/vercel.json` caps each function at 15s / 512 MB. The 12-function
ceiling is enforced by `npm run check:functions`; wire this into CI so a 13th
function fails the build.

## Domain + TLS

- `app.cloudtel.example` → web project.
- `api.cloudtel.example` → api project (the SPA calls this cross-origin, so set
  `CORS_ORIGINS`).
- PBX WebSocket uses `wss://` with a valid certificate; browsers require secure
  media (DTLS-SRTP) over WSS.

## Health

`GET /api/v1/health` (public) and `GET /api/v1/health/dependencies` (session)
report DB connectivity and applied migration count. Point uptime monitoring at
`/health`.

## Rollback

Serverless deploys are immutable — promote the previous deployment in Vercel.
Migrations are forward-only; prefer additive changes and a follow-up migration
over destructive rollbacks (see [disaster-recovery.md](./disaster-recovery.md)).

## Telephony (Asterisk + ARI)

Real calls are served by a self-hosted Asterisk stack (see
`telephony/deploy/README.md`): Asterisk 20 with a PJSIP WebSocket transport, an
ARI bridge that routes internal calls and posts lifecycle webhooks, and a
loopback-only PBX admin API used by the CloudTel API to provision extensions.

- The SPA registers with `wss://<SIP_DOMAIN>/ws` (TLS terminated by nginx).
- `GET /settings/telephony` lazily provisions the caller's extension, pushes the
  SIP credential to the PBX and returns it to its owner.
- RTP uses inbound UDP 10000-20000, which must be allowed by the host firewall.
