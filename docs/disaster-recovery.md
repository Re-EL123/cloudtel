# Disaster recovery

## Objectives

| Target | Value |
| --- | --- |
| RPO (max data loss) | ≤ 5 minutes (managed Postgres PITR) |
| RTO (time to restore) | ≤ 1 hour |
| Backup retention | ≥ 30 days, off-site / cross-region |

## What to back up

| Asset | Where | Method |
| --- | --- | --- |
| PostgreSQL | managed DB | automated snapshots + PITR |
| Secrets/env | Vercel project settings | encrypted export to the secret store |
| Asterisk config | PBX host | versioned in `telephony/asterisk/` + host backup |
| Application code | git remote | normal source control |

> Recordings/voicemail and CDN assets should be stored in durable object
> storage (e.g. S3/R2) with its own lifecycle policy, not on the PBX disk.

## Restore procedure

1. **Provision** a fresh PostgreSQL instance of the same major version.
2. **Restore** the most recent snapshot, or PITR to the chosen timestamp.
3. **Verify** migrations: `SELECT version FROM schema_migrations ORDER BY version;`
   should list all 16. If the snapshot predates a migration, apply it:
   `DATABASE_URL=… npm run db:migrate`.
4. **Repoint** the API: update `DATABASE_URL` on the API project and redeploy.
5. **Smoke test**: `GET /api/v1/health` and `/health/dependencies`, then log in
   with a known account and load `/extensions`.
6. **Reconnect** `ari-bridge` (it re-subscribes to Stasis and resumes forwarding
   events). Verify new calls appear in history.

## Failure scenarios

### Database unavailable

API requests fail with `500 INTERNAL_ERROR` (and login rate limiting fails
closed). Restore from snapshot/PITR and repoint. No data is lost beyond the RPO
window.

### Region outage

Redeploy both Vercel projects to a healthy region and repoint `DATABASE_URL` to a
cross-region replica promoted to primary. Update DNS if a custom domain is used.

### PBX outage

The SPA falls back to a clear "registration failed" state; no calls can be
placed until the PBX returns. History and settings remain fully available
because they are served from the database. `ari-bridge` reconnects
automatically.

### Lost webhook secret / bridge compromise

Rotate `TELEPHONY_WEBHOOK_SECRET` (and `BILLING_WEBHOOK_SECRET`) on both the API
and the bridge, then restart the bridge. Old signatures stop verifying
immediately.

## Drill checklist

Run quarterly:

- [ ] Restore a snapshot into a scratch database and apply migrations.
- [ ] Point a staging API at it; run `npm run test:integration` and
      `npm run test:security`.
- [ ] Verify login, extension list, and call history load.
- [ ] Confirm `ari-bridge` reconnects and a test call is recorded.
- [ ] Record actual RTO/RPO and update this document.
