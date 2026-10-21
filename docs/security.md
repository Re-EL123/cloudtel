# Security

## Authentication

- Passwords are hashed with `crypto.scrypt`
  (`scrypt$N=16384,r=8,p=1$<salt>$<hash>`). See
  `apps/api/lib/authentication.js`.
- Sessions are database-backed random tokens. Only the SHA-256 hash of the token
  is stored, so a database leak does not expose live sessions.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Login lockout: 5 failed attempts lock the account for 15 minutes.
- Password reset tokens are single-use, hashed, and expire after 60 minutes.
  Changing or resetting a password revokes all existing sessions.

## CSRF

Double-submit token. The CSRF value is set in the readable `cloudtel_csrf`
cookie and must be echoed in the `x-csrf-token` header on every state-changing
request. Comparison is timing-safe. Safe methods (`GET`/`HEAD`/`OPTIONS`) are
exempt.

## Authorisation (RBAC)

Roles are ranked and permissions use a `namespace:action` format
(`packages/shared/src/permissions.js`, `roles.js`):

```
platform_admin (50) > owner (40) > admin (30) > supervisor (20) > user = auditor (10)
```

- Every protected route independently authenticates **and** re-checks
  organisation-scoped authorisation. CORS is never used as authentication.
- `requirePermission(context, permission)` throws `403 FORBIDDEN` when the role
  lacks the permission.
- `assertOutranks(actorRole, targetRole)` prevents modifying peers or superiors
  and the owner-protection rule prevents removing the last owner.
- Permission sets are monotonic by rank (supervisors ⊇ users, admins ⊇
  supervisors, owners ⊇ admins).

## Multi-tenant isolation

- Every tenant-owned row carries `organisation_id`; every query filters on it.
- Cross-tenant ids return `404` (not `403`) so existence is not leaked.
- The tenant security suite (`tests/security/tenant-isolation.test.js`) asserts
  that a user in org A cannot read or mutate org B rows via crafted ids.

## Secrets

- Never commit secrets, SIP passwords, PBX credentials, or TLS keys.
- SIP passwords are stored server-side only. `/settings/telephony` and
  `/extensions/:id/telephony` return public identifiers only.
- `.env` is git-ignored; use `.env.example` as a template.

## Webhooks

- HMAC-SHA256 over `<timestamp>.<rawBody>`; verified timing-safely.
- Replays outside a ±5 minute window are rejected (`REPLAY_DETECTED`).
- Events are deduplicated by event id and unique
  `(organisation_id, provider_call_id, event_type, occurred_at)` rows for
  idempotent processing.

## Auditing

All admin and security-relevant actions write an `audit_logs` row
(`org`, `user`, `action`, `resource`, `metadata`, `ip`, `requestId`). Audit
writes never throw (`apps/api/lib/audit.js`).

## Rate limiting

Fixed-window counters stored in `rate_limit_counters`, keyed by route + IP and
by action. Login and password reset have their own strict buckets. When the
store fails, sensitive buckets fail closed.

## HTTP hardening

- CORS allow-list from `CORS_ORIGINS`/`APP_URL`; credentials allowed.
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`) are set for the API in
  `vercel.json`, together with a Content-Security-Policy for the SPA in
  `apps/web/vercel.json`.
- `Cache-Control: no-store` on all API responses.

## Reporting

Report vulnerabilities to the maintainers privately; do not open public issues
for security defects.
