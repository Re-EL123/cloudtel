# Architecture

CloudTel is a browser-based VoIP softphone and business communications
platform. It is deliberately split into three independently deployable parts:

```
┌────────────────────────┐     HTTPS/JSON      ┌────────────────────────┐
│  apps/web (static SPA) │ ──────────────────► │  apps/api (serverless) │
│  HTML + CSS + ES mods  │ ◄────────────────── │  12 Vercel functions   │
└───────────┬────────────┘                     └───────────┬────────────┘
            │ SIP over WSS (SIP.js)                        │ pg (SQL)
            ▼                                               ▼
┌────────────────────────┐                     ┌────────────────────────┐
│  Asterisk PBX (ARI)    │ ── signed webhooks ►│   PostgreSQL           │
└───────────┬────────────┘   (ari-bridge)      └────────────────────────┘
            │
            ▼
     telephony/ari-bridge (Node service)
```

## Components

| Path | Responsibility |
| --- | --- |
| `apps/web` | Static, build-free frontend. ES modules, BEM CSS, service worker. |
| `apps/api` | Serverless JSON API. Exactly 12 catch-all functions. |
| `packages/shared` | Constants, roles, permissions, validation rules, call status. |
| `packages/ui` | Framework-free UI primitives (buttons, inputs, dialogs, toasts). |
| `apps/api/lib` | Shared server libraries (routing, auth, validation, PBX, audit…). |
| `telephony/` | Asterisk config examples and the ARI → webhook bridge. |
| `database/` | Versioned migrations and development seeds. |

## The 12-function ceiling

Vercel bills and cold-starts per function, and the product spec (§15.3) caps the
API at **12 serverless functions**. Each is a catch-all route group that
dispatches many subroutes internally:

```
auth  organisations  extensions  contacts  calls  call-control
settings  users  admin  webhooks  billing  health
```

`scripts/check-functions.mjs` enforces the ceiling and CI fails if it is
exceeded. Never add a function under `apps/api/api/` without removing another.

### Request lifecycle

Every function file ends with `export default createHandler(routes)`.
`createHandler` (`apps/api/lib/router.js`) strips the `/api/v1` prefix, matches
the method + path (equal segment counts, `:params`, first-match wins), applies
rate limiting and authentication, then calls the route handler with a context
object. Errors are serialised by `handler()` (`apps/api/lib/response.js`).

```
incoming → handler() sets ctx/CORS → createHandler matches → auth+rate limit
        → route.handle(ctx) → success()/fail() envelope
```

## Response envelope

Every response uses one shape (`apps/api/lib/response.js`):

```json
{ "success": true,  "data": { }, "meta": { "requestId": "…", "page": 1 } }
{ "success": false, "error": { "code": "…", "message": "…", "fields": {} },
  "meta": { "requestId": "…" } }
```

## Frontend architecture

- No bundler, no build step. Pages are static HTML loading ES modules.
- `core/api-client.js` is the **only** file that calls `fetch()`. Every feature
  goes through it; endpoints are declared in `core/endpoints.js`.
- `core/state.js` holds UI state; telephony and auth own **independent** state
  machines (`telephony/call-state.js`).
- `telephony/` is the **only** place that imports SIP.js; `audio.js` is the
  **only** place that calls `getUserMedia`.
- `packages/shared` and `packages/ui` are mirrored into
  `apps/web/assets/js/{shared,ui}/` by `npm run build` (`scripts/sync-shared.mjs`).
  **Never edit the mirrors.**

## Data model

Multi-tenant: every tenant-owned row carries `organisation_id`, and every query
is organisation-scoped. Call duration and billable duration are separate fields;
billing is derived from PBX usage records, never from the browser timer. See
[database.md](./database.md).

## Telephony

Signalling goes browser → Asterisk over secure WebSocket (SIP.js). Asterisk
events flow to `telephony/ari-bridge`, which signs and forwards them to
`POST /api/v1/webhooks/telephony`. See [telephony.md](./telephony.md).
