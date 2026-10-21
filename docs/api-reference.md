# API reference

Base URL: `/api/v1`. All responses use the envelope described in
[architecture.md](./architecture.md).

## Authentication

Session-based. `POST /auth/login` sets two cookies:

| Cookie | Flags | Purpose |
| --- | --- | --- |
| `cloudtel_session` | `HttpOnly`, `SameSite=Lax`, `Secure` (prod) | session token |
| `cloudtel_csrf` | readable by JS, `SameSite=Lax` | CSRF double-submit value |

State-changing requests (`POST`/`PATCH`/`PUT`/`DELETE`) must echo the CSRF value
in the `x-csrf-token` header. Missing/mismatched token → `403 CSRF_FAILED`.

Auth modes on a route:

- **session** — must be logged in; CSRF enforced on state changes.
- **public** — no session required.
- **webhook** — raw body + HMAC signature (see below).

## Endpoints

### auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | rate limited 10/15min per IP |
| POST | `/auth/logout` | session | clears cookies |
| GET | `/auth/session` | session | current user + permissions |
| POST | `/auth/refresh` | session | touch session, return payload |
| POST | `/auth/password/forgot` | public | anti-enumeration, always 200 |
| POST | `/auth/password/reset-request` | public | alias of `forgot` |
| POST | `/auth/password/reset` | public | `{ token, password }` |
| POST | `/auth/password/change` | session | revokes other sessions |

### users

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/users` | `users:read` |
| GET | `/users/me` | session |
| PATCH | `/users/me` | session |
| GET | `/users/me/sessions` | session |
| DELETE | `/users/me/sessions/:id` | session |
| GET | `/users/invitations` | `users:read` |
| POST | `/users/invitations` | `users:create` |
| GET | `/users/:id` | `users:read` |
| POST | `/users` | `users:create` |
| PATCH | `/users/:id` | session (role-ranked) |
| DELETE | `/users/:id` | session (role-ranked) |

### organisations

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/organisations` | session |
| GET | `/organisations/mine` | session |
| GET | `/organisations/current` | session |
| PATCH | `/organisations/current` | `org:manage` |
| POST | `/organisations/switch` | session |
| GET | `/organisations/:id` | session |
| POST | `/organisations` | session |
| PATCH | `/organisations/:id` | session |
| GET | `/organisations/:id/members` | session |
| PATCH | `/organisations/:id/members/:userId` | session (outranks) |
| DELETE | `/organisations/:id/members/:userId` | session (outranks) |

### extensions

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/extensions` | session (scoped) |
| GET | `/extensions/me` | session |
| GET | `/extensions/:id/telephony` | session (public ids only) |
| POST | `/extensions` | `extensions:manage` |
| PATCH | `/extensions/:id` | `extensions:manage` |
| POST | `/extensions/:id/disable` | `extensions:manage` |
| POST | `/extensions/:id/enable` | `extensions:manage` |
| POST | `/extensions/:id/rotate` | `extensions:manage` |
| DELETE | `/extensions/:id` | `extensions:manage` |

> `/extensions/:id/telephony` never returns SIP passwords — only public
> identifiers (domain, WSS URL, transport, voicemail code).

### contacts

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/contacts` | `?search=&scope=&mine=&page=` |
| GET | `/contacts/search` | `?q=`, limit ≤ 50 |
| GET | `/contacts/favourites` | caller's favourites |
| GET | `/contacts/:id` | |
| POST | `/contacts` | |
| PATCH | `/contacts/:id` | |
| POST | `/contacts/:id/favourite` | |
| DELETE | `/contacts/:id/favourite` | |
| DELETE | `/contacts/:id` | |

### calls

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/calls` | history, `?includeActive=true` |
| GET | `/calls/active` | in-progress calls |
| GET | `/calls/voicemail` | voicemail deposits |
| GET | `/calls/stats` | aggregate counters |
| GET | `/calls/export` | `calls:export`, CSV download |
| GET | `/calls/:id` | |
| GET | `/calls/:id/usage` | billing usage rows |
| POST | `/calls` | record browser-originated call |
| PATCH | `/calls/:id` | answer/end/disposition/duration |

`POST /calls` accepts either naming convention for the callee
(`calleeNumber` or `remoteNumber`) and an optional `displayName`, `startedAt`,
`providerCallId`, `direction`. `PATCH /calls/:id` accepts `answeredAt`,
`endedAt`, `durationSeconds`, `disposition`, `hangupCause`, `billableSeconds`.

### call-control

PBX-backed control for the active call.

| Method | Path |
| --- | --- |
| POST | `/call-control/:callId/answer` |
| POST | `/call-control/:callId/hangup` |
| POST | `/call-control/:callId/hold` |
| POST | `/call-control/:callId/resume` |
| GET | `/call-control/:callId/hold` |
| POST | `/call-control/:callId/mute` |
| POST | `/call-control/:callId/transfer` (`calls:transfer`) |
| POST | `/call-control/:callId/dtmf` |
| POST | `/call-control/device` |

### settings

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/settings` | session |
| PATCH | `/settings` | `settings:manage` |
| PUT | `/settings` | `settings:manage` |
| GET/PATCH | `/settings/audio` | session / `settings:manage` |
| GET/PATCH | `/settings/notifications` | session / `settings:manage` |
| GET/PATCH | `/settings/telephony` | session / `settings:manage` |

### admin

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin/dashboard` | `admin:dashboard` |
| GET | `/admin/audit-logs` | `admin:audit` |
| GET | `/admin/usage` | `admin:usage` |
| POST | `/admin/users/:id/suspend` | `users:suspend` |
| POST | `/admin/extensions/:id/revoke` | `extensions:revoke` |

### billing

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/billing/plan` | session |
| GET | `/billing/usage` | session |
| POST | `/billing/checkout` | `billing:manage` |
| POST | `/billing/portal` | `billing:manage` |

### webhooks

| Method | Path |
| --- | --- |
| POST | `/webhooks/telephony` |
| POST | `/webhooks/billing` |

Webhooks require the raw body to be signed:

```
X-Webhook-Timestamp: <unix seconds>
X-Webhook-Signature: v1=<hex hmac-sha256(timestamp + "." + rawBody)>
X-Event-Id:          <unique event id>
```

Signature must verify, timestamp must be within ±5 minutes, and events are
deduplicated by `(organisation_id, provider_call_id, event_type, occurred_at)`
for idempotent processing.

### health

| Method | Path |
| --- | --- |
| GET | `/health` |
| GET | `/health/dependencies` |

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | invalid fields (`error.fields`) |
| `UNAUTHENTICATED` | 401 | missing/invalid session |
| `SESSION_EXPIRED` | 401 | session past its TTL |
| `CSRF_FAILED` | 403 | missing/mismatched CSRF token |
| `FORBIDDEN` | 403 | role lacks the required permission |
| `NOT_FOUND` | 404 | missing or out-of-scope resource |
| `METHOD_NOT_ALLOWED` | 405 | path exists, wrong method |
| `RATE_LIMITED` | 429 | per-IP / per-route limit hit |
| `PAYLOAD_TOO_LARGE` | 413 | body over the size limit |
| `INTERNAL_ERROR` | 500 | unexpected server error |
