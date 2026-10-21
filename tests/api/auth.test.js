/**
 * Auth integration tests. Require DATABASE_URL (see tests/helpers/db.js).
 *
 * Verifies the full cookie+CSRF session flow against a real database:
 * login, session, refresh, CSRF enforcement, logout, password reset.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import authHandler from "../../apps/api/api/v1/auth/[[...path]].js";
import { hasDatabase, prepareDatabase, resetTransient, closeDatabase, FIXTURES } from "../helpers/db.js";
import { login, anonymous } from "../helpers/session.js";

const opts = { skip: !hasDatabase };
const password = FIXTURES.password;
const email = FIXTURES.email.owner;

before(async () => {
  if (!hasDatabase) return;
  await prepareDatabase();
  await resetTransient();
});

after(async () => {
  await closeDatabase();
});

test("login issues session and CSRF cookies plus a session payload", opts, async () => {
  const client = await login(authHandler, { email, password, ip: "10.0.0.1" });
  assert.ok(client.jar.cloudtel_session, "session cookie missing");
  assert.ok(client.jar.cloudtel_csrf, "csrf cookie missing");
  assert.equal(client.data.user.email, email);
  assert.ok(Array.isArray(client.data.permissions));
  assert.ok(client.data.role);
});

test("login rejects a wrong password", opts, async () => {
  const anon = anonymous(authHandler, "10.0.0.2");
  const res = await anon.request("POST", "/api/v1/auth/login", {
    body: { email, password: "definitely-wrong" },
  });
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, "UNAUTHENTICATED");
});

test("GET /auth/session reflects the authenticated user", opts, async () => {
  const client = await login(authHandler, { email, password, ip: "10.0.1.1" });
  const res = await client.request(authHandler, "GET", "/api/v1/auth/session", { csrf: false });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.user.email, email);
});

test("GET /auth/session is 401 without a cookie", opts, async () => {
  const anon = anonymous(authHandler, "10.0.0.3");
  const res = await anon.request("GET", "/api/v1/auth/session");
  assert.equal(res.status, 401);
});

test("state-changing request without CSRF header is forbidden", opts, async () => {
  const client = await login(authHandler, { email, password, ip: "10.0.2.1" });
  const res = await client.request(authHandler, "POST", "/api/v1/auth/refresh", { csrf: false });
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, "CSRF_FAILED");
});

test("POST /auth/refresh with CSRF returns the session payload", opts, async () => {
  const client = await login(authHandler, { email, password, ip: "10.0.3.1" });
  const res = await client.request(authHandler, "POST", "/api/v1/auth/refresh");
  assert.equal(res.status, 200);
  assert.equal(res.json.data.user.email, email);
});

test("logout clears cookies and invalidates the session", opts, async () => {
  const client = await login(authHandler, { email, password, ip: "10.0.4.1" });
  const out = await client.request(authHandler, "POST", "/api/v1/auth/logout");
  assert.equal(out.status, 200);
  assert.equal(out.json.data.signedOut, true);
  const after = await client.request(authHandler, "GET", "/api/v1/auth/session", { csrf: false });
  assert.equal(after.status, 401);
});

test("password forgotten always returns accepted (no enumeration)", opts, async () => {
  const anon = anonymous(authHandler, "10.0.0.4");
  const known = await anon.request("POST", "/api/v1/auth/password/forgot", { body: { email } });
  const unknown = await anon.request("POST", "/api/v1/auth/password/forgot", {
    body: { email: "nobody@nowhere.test" },
  });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(known.json.data.accepted, true);
  assert.equal(unknown.json.data.accepted, true);
});

test("password reset-request alias behaves like forgot", opts, async () => {
  const anon = anonymous(authHandler, "10.0.0.5");
  const res = await anon.request("POST", "/api/v1/auth/password/reset-request", { body: { email } });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.accepted, true);
});
