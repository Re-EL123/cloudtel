# Troubleshooting

## Setup

### `DATABASE_URL is not configured`

`apps/api/lib/database.js` throws when the API starts without `DATABASE_URL`.
Set it (see `.env.example`); integration tests also require it.

### Migrations fail partway

Migrations run in a transaction and are recorded in `schema_migrations`. If a
migration fails it is rolled back and **not** recorded, so re-running is safe.
Check the failing SQL in `database/migrations/NNN_*.sql`.

### `npm run db:seed` refuses to run

The seed refuses when `NODE_ENV=production`. This is intentional. For a
non-production database set `NODE_ENV` to anything else.

## Development credentials

The development seed creates (password for all users: `CloudTel!Demo2026`):

| Email | Role | Org |
| --- | --- | --- |
| `owner@demo.cloudtel.test` | owner | CloudTel Demo |
| `admin@demo.cloudtel.test` | admin | CloudTel Demo |
| `agent@demo.cloudtel.test` | user | CloudTel Demo |
| `owner@acme.cloudtel.test` | owner | Acme Corporation |
| `platform@cloudtel.test` | platform admin | — |

Extensions: `1001` (owner), `1002` (admin), `1003` (agent), `2001` (Acme).

## API

### All requests return 401 `UNAUTHENTICATED`

The `cloudtel_session` cookie is missing or expired. Log in again. If it
immediately 401s after login, check the cookie is not being dropped — it is
`HttpOnly` + `Secure` in production, so the site must be served over HTTPS.

### `403 CSRF_FAILED` on POST/PATCH/DELETE

The `x-csrf-token` header must equal the `cloudtel_csrf` cookie. The SPA does
this automatically; raw clients must read the cookie and echo it. Refresh the
page if the cookie is stale.

### `429 RATE_LIMITED`

Per-IP or per-route fixed-window limit hit. Check `Retry-After`. Counters live in
`rate_limit_counters`; clear them in dev with
`DELETE FROM rate_limit_counters`.

### `404` instead of `403` for another org's row

This is correct: cross-tenant ids deliberately return `404` so existence is not
leaked.

## Telephony

### Registration fails (`sip:registration` never reaches `registered`)

- The browser only accepts `wss://` with a valid certificate; check
  `SIP_WSS_URL` and the certificate chain.
- Verify the extension's PJSIP endpoint credentials match the server-stored
  password (rotate via `POST /extensions/:id/rotate` if unsure).
- Check the WSS transport is bound and reachable and CORS/WebSocket upgrade is
  not blocked by a proxy.
- Inspect `registration.changed` events arriving at `/webhooks/telephony`.

### One-way audio

- Ensure `media_encryption = dtls` and `ice_support = yes` on the endpoint.
- `direct_media` must be `no` for NATed WebRTC clients.
- Confirm the PBX's RTP ports are reachable and STUN/TURN (if configured) works.

### Calls connect but no history appears

History is written from webhooks, not the browser. Confirm:

- `ari-bridge` is running and subscribed to the Stasis app.
- `TELEPHONY_WEBHOOK_SECRET` matches between the bridge and the API.
- The event timestamps are within the ±5 minute replay window.
- `organisationId` or `extension` in the payload resolves to a tenant.

### Webhooks return `401 INVALID_SIGNATURE`

The signature is `v1=HMAC_SHA256(timestamp + "." + rawBody)`. Common causes: the
raw body was re-serialised before signing, the secret differs, or the timestamp
is not in seconds. `REPLAY_DETECTED` (400) means the clock drifted.

## Frontend

### Service worker serves stale assets

Bump the cache name in `apps/web/assets/sw.js` (`cloudtel-v2` → `v3`) and
redeploy. Hard-reload to unregister in dev.

### Shared mirror out of date

The `apps/web/assets/js/{shared,ui}/` directories are generated. Run
`npm run build` (`scripts/sync-shared.mjs`) — never edit them by hand.
