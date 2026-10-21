# CloudTel — Repository Rules

These rules are binding for anyone (human or agent) working in this repository.

## 1. Product identity

- The product name is **CloudTel**. Use `CloudTel` in all user-facing copy, page titles,
  manifests, package names and documentation headings.
- Company/brand owner: **Re-EL Branding & Technologies**. "By Re-EL" style attribution is
  allowed in footers and about text, but the app itself is always "CloudTel".
- Primary brand colour is sky blue `#38BDF8` (hover `#0EA5E9`, deep `0284C7`).
  Design tokens live in `apps/web/assets/css/tokens.css`. Never hard-code colours elsewhere.

## 2. Serverless function ceiling (HARD RULE)

- **The API must never exceed 12 Vercel Serverless Functions.** This is a hard architectural
  ceiling taken from the product specification (section 15.3).
- The 12 functions are the endpoint groups under `apps/api/api/v1/`:
  `auth`, `users`, `organisations`, `extensions`, `contacts`, `calls`, `call-control`,
  `settings`, `admin`, `webhooks`, `billing`, `health`.
- Each group is one catch-all route function (`[...path].js`) that dispatches multiple HTTP
  methods and subroutes internally via shared libraries in `apps/api/lib/`.
- **Never** add a new file under `apps/api/api/` without removing another, and never add a
  function outside `apps/api/api/v1/<group>/`. Run `npm run check:functions` to verify the
  count is exactly ≤ 12. CI fails if the count is exceeded.

## 3. Architecture boundaries

- Frontend is static HTML/CSS/JS (ES modules, no bundler). No React/TypeScript/build step.
- All browser API calls go through `apps/web/assets/js/core/api-client.js`. Features never
  `fetch()` directly.
- All SIP/WebRTC operations go through `apps/web/assets/js/telephony/`. UI never touches
  SIP.js directly.
- Browser state objects (`state.js`) are the single source of truth for UI; telephony and
  auth keep **independent** state machines.
- Server code must never import from `apps/web`; the browser may import the synced mirrors
  `apps/web/assets/js/shared/` and `apps/web/assets/js/ui/` (generated from `packages/`
  by `npm run build` — never edit the mirrors by hand).

## 4. Security rules

- Never commit secrets, SIP passwords, PBX credentials, TLS keys or real `.env` files.
- SIP passwords must never reach the browser. The `/settings/telephony` endpoint returns
  public identifiers only.
- Every protected endpoint must independently authenticate the session **and** re-check
  organisation-scoped authorisation. CORS is not authentication.
- Passwords are hashed with `crypto.scrypt` (see `apps/api/lib/authentication.js`).
- Sessions are HTTP-only, `Secure`, `SameSite=Lax` cookies with a CSRF double-submit token.
- State-changing cookie-authenticated requests must validate the CSRF token.
- All admin actions must write an audit log entry.
- Webhooks must verify the provider HMAC signature, reject replays outside a 5-minute
  window, and deduplicate by event id (idempotent).

## 5. Data rules

- Multi-tenant: every tenant-owned row carries `organisation_id`; every query is
  organisation-scoped.
- Timestamps are UTC in the database; display uses the user's timezone
  (default `Africa/Johannesburg`).
- Call duration and billable duration are separate fields; never derive billing from the
  browser timer.
- Schema changes are only made through numbered migrations in `database/migrations/`.

## 6. Consistency rules

- API responses always use the envelope from `apps/api/lib/response.js`
  (`{ success, data|error, meta.requestId }`).
- Validation rules live in `packages/shared/src/validation-rules.js` and are enforced on
  both client and server.
- Roles/permissions live in `packages/shared/src/roles.js` + `permissions.js`; never
  hard-code role names elsewhere.
- Icons are inline Lucide SVG paths served from `apps/web/assets/js/components/icons.js`.
- All JS runs on Node ≥ 20 (`node:` built-ins only, plus `pg` on the server).

## 7. Quality gates

Before finishing any task, run:

```bash
npm run build          # sync packages/ mirrors into apps/web
npm run check:functions
npm run lint
npm run test:unit
```

If a PostgreSQL instance is available (`DATABASE_URL`), also run
`npm run test:integration` and `npm run test:security`.
