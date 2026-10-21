/**
 * Durable fixed-window rate limiting backed by PostgreSQL.
 * Serverless instances cannot share memory, so counters live in the database
 * (§15.2). Falls back to allowing the request if the store is unavailable,
 * except for the login limiter which fails closed via { failClosed: true }.
 */
import { query } from "./database.js";

/**
 * @param {string} key - unique bucket key (e.g. "login:ip:1.2.3.4")
 * @param {{windowMs:number, max:number}} limit
 * @param {{failClosed?: boolean}} [options]
 * @returns {Promise<{allowed:boolean, remaining:number, resetAt:Date}>}
 */
export async function consumeRateLimit(key, limit, options = {}) {
  const { windowMs, max } = limit;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);

  try {
    const { rows } = await query(
      `INSERT INTO rate_limit_counters (key, window_start, count, expires_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (key) DO UPDATE
         SET count = CASE
              WHEN rate_limit_counters.window_start < EXCLUDED.window_start THEN 1
              ELSE rate_limit_counters.count + 1
            END,
             window_start = CASE
              WHEN rate_limit_counters.window_start < EXCLUDED.window_start THEN EXCLUDED.window_start
              ELSE rate_limit_counters.window_start
            END,
             expires_at = EXCLUDED.expires_at
       RETURNING count, window_start, expires_at`,
      [key, windowStart, expiresAt]
    );
    const row = rows[0];
    return {
      allowed: row.count <= max,
      remaining: Math.max(0, max - row.count),
      resetAt: new Date(row.expires_at),
    };
  } catch (err) {
    console.error("rate-limit:store-unavailable", { message: err?.message });
    if (options.failClosed) {
      return { allowed: false, remaining: 0, resetAt: expiresAt };
    }
    return { allowed: true, remaining: max, resetAt: expiresAt, degraded: true };
  }
}

/** Best-effort removal of expired counters (called opportunistically). */
export async function cleanupRateLimits() {
  try {
    await query(`DELETE FROM rate_limit_counters WHERE expires_at < now() - interval '1 hour'`);
  } catch {
    /* non-critical */
  }
}

export function rateLimitKey(parts) {
  return parts.filter(Boolean).join(":").slice(0, 180);
}
