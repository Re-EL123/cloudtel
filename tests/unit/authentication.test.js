import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateToken,
  parseCookies,
  sessionCookie,
  csrfCookie,
  clearSessionCookies,
  isStateChanging,
  validateCsrf,
} from "../../apps/api/lib/authentication.js";
import { SESSION } from "@cloudtel/shared";

test("hashPassword produces a versioned scrypt hash", async () => {
  const hash = await hashPassword("CloudTel!Demo2026");
  assert.match(hash, /^scrypt\$N=16384,r=8,p=1\$[^$]+\$[^$]+$/);
});

test("hashPassword salts: identical passwords hash differently", async () => {
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  assert.notEqual(a, b);
});

test("verifyPassword accepts the correct password", async () => {
  const hash = await hashPassword("correct horse");
  assert.equal(await verifyPassword("correct horse", hash), true);
});

test("verifyPassword rejects the wrong password", async () => {
  const hash = await hashPassword("correct horse");
  assert.equal(await verifyPassword("wrong horse", hash), false);
});

test("verifyPassword rejects malformed stored hashes", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(await verifyPassword("x", ""), false);
});

test("hashToken is a deterministic sha256 hex digest", () => {
  const a = hashToken("token-value");
  const b = hashToken("token-value");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, hashToken("token-other"));
});

test("generateToken returns unique base64url strings", () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test("parseCookies decodes a Cookie header", () => {
  const req = { headers: { cookie: "cloudtel_session=abc; cloudtel_csrf=def" } };
  assert.deepEqual(parseCookies(req), { cloudtel_session: "abc", cloudtel_csrf: "def" });
});

test("parseCookies tolerates a missing header", () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
});

test("sessionCookie is HttpOnly and uses the shared cookie name", () => {
  const cookie = sessionCookie("tok", 3600);
  assert.match(cookie, new RegExp(`^${SESSION.COOKIE_NAME}=tok`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test("csrfCookie is readable by JavaScript (not HttpOnly)", () => {
  const cookie = csrfCookie("csrf-value", 3600);
  assert.match(cookie, new RegExp(`^${SESSION.CSRF_COOKIE_NAME}=csrf-value`));
  assert.doesNotMatch(cookie, /HttpOnly/);
});

test("clearSessionCookies expires both cookies", () => {
  const cookies = clearSessionCookies();
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) assert.match(cookie, /Max-Age=0/);
});

test("isStateChanging distinguishes safe from unsafe methods", () => {
  assert.equal(isStateChanging({ method: "GET" }), false);
  assert.equal(isStateChanging({ method: "HEAD" }), false);
  assert.equal(isStateChanging({ method: "OPTIONS" }), false);
  assert.equal(isStateChanging({ method: "POST" }), true);
  assert.equal(isStateChanging({ method: "DELETE" }), true);
});

test("validateCsrf compares the header against the cookie token", () => {
  const req = { method: "POST", headers: { [SESSION.CSRF_HEADER]: "match" } };
  assert.equal(validateCsrf(req, "match"), true);
  assert.equal(validateCsrf(req, "different"), false);
  assert.equal(validateCsrf({ method: "POST", headers: {} }, "match"), false);
});

test("validateCsrf always passes for safe methods", () => {
  assert.equal(validateCsrf({ method: "GET", headers: {} }, "anything"), true);
  assert.equal(validateCsrf({ method: "HEAD", headers: {} }, undefined), true);
});
