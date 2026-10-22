/**
 * Authentication: password hashing, database-backed sessions, cookies, CSRF,
 * login lockout and password-recovery tokens.
 * Sessions are HTTP-only cookies; CSRF uses a double-submit token (§13.1).
 */
import crypto from "node:crypto";
import { promisify } from "node:util";
import { SESSION } from "@cloudtel/shared";
import { query } from "./database.js";
import { ApiError } from "./response.js";

const scrypt = promisify(crypto.scrypt);

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MINUTES = 60;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return scrypt(String(password), salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS).then((derived) => {
    return [
      "scrypt",
      `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`,
      salt.toString("base64"),
      derived.toString("base64"),
    ].join("$");
  });
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const params = Object.fromEntries(
    parts[1].split(",").map((kv) => kv.split("="))
  );
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const derived = await scrypt(String(password), salt, expected.length, {
    N: Number(params.N) || SCRYPT_PARAMS.N,
    r: Number(params.r) || SCRYPT_PARAMS.r,
    p: Number(params.p) || SCRYPT_PARAMS.p,
  });
  return crypto.timingSafeEqual(derived, expected);
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Cookie helpers -------------------------------------------------------- */

export function parseCookies(req) {
  const header = req.headers.cookie;
  const jar = {};
  if (!header) return jar;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) jar[key] = decodeURIComponent(value);
  }
  return jar;
}

function secureFlag() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

/**
 * Cookie SameSite policy. Defaults to "Lax" (same-site deployments). When the
 * frontend is hosted on a different site (e.g. GitHub Pages at
 * cloudtel.re-el.co.za calling an API served from *.vercel.app), the browser
 * needs SameSite=None (with Secure) for the session cookie to be sent.
 */
function sameSiteFlag() {
  const value = (process.env.SESSION_COOKIE_SAMESITE || "Lax").trim();
  const policy = value === "None" || value === "Strict" ? value : "Lax";
  // SameSite=None is only valid with the Secure flag; enforce it in all envs.
  return policy === "None" ? "; SameSite=None" : `; SameSite=${policy}`;
}

export function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION.COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly${sameSiteFlag()}${secureFlag()}; Max-Age=${maxAgeSeconds}`;
}

export function csrfCookie(token, maxAgeSeconds) {
  // Readable by JavaScript on purpose: the SPA echoes it back in the
  // X-CSRF-Token header (double-submit pattern).
  return `${SESSION.CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/${sameSiteFlag()}${secureFlag()}; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookies() {
  return [
    `${SESSION.COOKIE_NAME}=; Path=/; HttpOnly${sameSiteFlag()}${secureFlag()}; Max-Age=0`,
    `${SESSION.CSRF_COOKIE_NAME}=; Path=/${sameSiteFlag()}${secureFlag()}; Max-Age=0`,
  ];
}

export function setCookieHeaders(res, cookies) {
  const existing = res.getHeader("Set-Cookie");
  const list = Array.isArray(existing) ? existing : existing ? [existing] : [];
  res.setHeader("Set-Cookie", [...list, ...cookies]);
}

/** Sessions -------------------------------------------------------------- */

export async function createSession({ userId, organisationId, ip, userAgent, ttlHours }) {
  const sessionToken = generateToken();
  const csrfToken = generateToken(24);
  const hours = Number(ttlHours || process.env.SESSION_TTL_HOURS || SESSION.DEFAULT_TTL_HOURS);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

  const { rows } = await query(
    `INSERT INTO sessions (token_hash, csrf_hash, user_id, organisation_id, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, expires_at`,
    [hashToken(sessionToken), hashToken(csrfToken), userId, organisationId || null, ip || "", userAgent || "", expiresAt]
  );

  return {
    sessionId: rows[0].id,
    sessionToken,
    csrfToken,
    expiresAt: rows[0].expires_at,
    maxAgeSeconds: hours * 3600,
  };
}

/**
 * Resolve a session cookie into an authenticated context.
 * @returns {null|{session, user, organisationId, role, isPlatformAdmin}}
 */
export async function resolveSession(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT s.id AS session_id, s.expires_at, s.revoked_at, s.user_id, s.organisation_id,
            u.id, u.email, u.name, u.status, u.is_platform_admin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.status !== "active") return null;

  let role = null;
  if (row.organisation_id) {
    const membership = await query(
      `SELECT role FROM organisation_members
        WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
      [row.organisation_id, row.user_id]
    );
    role = membership.rows[0]?.role || null;
  }

  return {
    session: { id: row.session_id, expiresAt: row.expires_at, organisationId: row.organisation_id },
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      status: row.status,
      isPlatformAdmin: row.is_platform_admin,
    },
    organisationId: row.organisation_id,
    role: row.is_platform_admin ? "platform_admin" : role,
    isPlatformAdmin: row.is_platform_admin,
  };
}

export async function touchSession(sessionId) {
  await query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [sessionId]);
}

/**
 * Issue a fresh CSRF token for an existing session and persist its hash.
 * Cross-origin frontends cannot read the CSRF cookie (it belongs to the API
 * origin), so session/refresh responses return this token in the JSON body.
 */
export async function rotateCsrfToken(sessionId) {
  const csrfToken = generateToken(24);
  await query(`UPDATE sessions SET csrf_hash = $2 WHERE id = $1`, [sessionId, hashToken(csrfToken)]);
  return csrfToken;
}

export async function setSessionOrganisation(sessionId, organisationId, role) {
  await query(`UPDATE sessions SET organisation_id = $2 WHERE id = $1`, [sessionId, organisationId]);
  return role;
}

export async function revokeSession(sessionToken) {
  if (!sessionToken) return;
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(sessionToken)]
  );
}

export async function revokeSessionById(sessionId) {
  await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
}

export async function revokeAllUserSessions(userId) {
  await query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}

export async function listUserSessions(userId) {
  const { rows } = await query(
    `SELECT id, ip, user_agent, created_at, last_seen_at, expires_at
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_seen_at DESC`,
    [userId]
  );
  return rows;
}

/** CSRF ------------------------------------------------------------------ */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isStateChanging(req) {
  return !SAFE_METHODS.has((req.method || "GET").toUpperCase());
}

export function validateCsrf(req, csrfToken) {
  if (!isStateChanging(req)) return true;
  const header = req.headers[SESSION.CSRF_HEADER];
  if (!header || !csrfToken) return false;
  const a = Buffer.from(String(header));
  const b = Buffer.from(String(csrfToken));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Login lockout --------------------------------------------------------- */

export async function registerLoginFailure(user) {
  const failures = (user.failed_login_count || 0) + 1;
  if (failures >= LOGIN_MAX_FAILURES) {
    const lockedUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
    await query(`UPDATE users SET failed_login_count = 0, locked_until = $2, updated_at = now() WHERE id = $1`, [
      user.id,
      lockedUntil,
    ]);
    return { locked: true, lockedUntil };
  }
  await query(`UPDATE users SET failed_login_count = $2, updated_at = now() WHERE id = $1`, [user.id, failures]);
  return { locked: false, remaining: LOGIN_MAX_FAILURES - failures };
}

export async function clearLoginFailures(userId) {
  await query(`UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [
    userId,
  ]);
}

export function isLocked(user) {
  return Boolean(user.locked_until && new Date(user.locked_until).getTime() > Date.now());
}

/** Password recovery ----------------------------------------------------- */

export async function createPasswordResetToken(userId, ip) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashToken(token), expiresAt, ip || ""]
  );
  return { token, expiresAt };
}

export async function consumePasswordResetToken(token) {
  const { rows } = await query(
    `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
    [hashToken(token || "")]
  );
  const row = rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw new ApiError(400, "VALIDATION_ERROR", "This password reset link is invalid or has expired.");
  }
  await query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
  return row;
}

/** Lookup helpers -------------------------------------------------------- */

export async function findUserByEmail(email) {
  const { rows } = await query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [String(email || "")]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Authenticate the current request.
 * @returns context with user/session, or throws ApiError(401).
 * CSRF is validated for state-changing requests unless skipCsrf is set
 * (webhook routes authenticate with signatures instead).
 */
export async function authenticate(req, { skipCsrf = false } = {}) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION.COOKIE_NAME];
  if (!token) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  const context = await resolveSession(token);
  if (!context) {
    throw new ApiError(401, "SESSION_EXPIRED", "Your session has expired. Sign in again.");
  }
  if (!skipCsrf && isStateChanging(req)) {
    const csrfToken = cookies[SESSION.CSRF_COOKIE_NAME];
    if (!validateCsrf(req, csrfToken)) {
      throw new ApiError(403, "CSRF_FAILED", "Security check failed. Refresh the page and try again.");
    }
  }
  return { ...context, sessionToken: token };
}
