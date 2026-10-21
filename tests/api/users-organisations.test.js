/**
 * Users and organisations integration tests. Require DATABASE_URL.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import authHandler from "../../apps/api/api/v1/auth/[[...path]].js";
import usersHandler from "../../apps/api/api/v1/users/[[...path]].js";
import organisationsHandler from "../../apps/api/api/v1/organisations/[[...path]].js";
import { hasDatabase, prepareDatabase, resetTransient, closeDatabase, FIXTURES } from "../helpers/db.js";
import { login } from "../helpers/session.js";

const opts = { skip: !hasDatabase };

before(async () => {
  if (!hasDatabase) return;
  await prepareDatabase();
  await resetTransient();
});

after(async () => {
  await closeDatabase();
});

test("GET /users/me returns profile and memberships", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.owner,
    password: FIXTURES.password,
    ip: "10.2.0.1",
  });
  const res = await client.request(usersHandler, "GET", "/api/v1/users/me", { csrf: false });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.email, FIXTURES.email.owner);
  assert.ok(Array.isArray(res.json.data.memberships));
  assert.ok(res.json.data.memberships.some((m) => m.organisationId === FIXTURES.org.demo));
});

test("PATCH /users/me updates the display name", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.agent,
    password: FIXTURES.password,
    ip: "10.2.0.2",
  });
  const res = await client.request(usersHandler, "PATCH", "/api/v1/users/me", {
    body: { name: "Lerato Integration" },
  });
  assert.equal(res.status, 200);
  const read = await client.request(usersHandler, "GET", "/api/v1/users/me", { csrf: false });
  assert.equal(read.json.data.name, "Lerato Integration");
  await client.request(usersHandler, "PATCH", "/api/v1/users/me", { body: { name: "Lerato Dlamini" } });
});

test("GET /users/me/sessions lists the current session", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.owner,
    password: FIXTURES.password,
    ip: "10.2.0.3",
  });
  const res = await client.request(usersHandler, "GET", "/api/v1/users/me/sessions", { csrf: false });
  assert.equal(res.status, 200);
  assert.ok(res.json.data.some((s) => s.current === true));
});

test("GET /organisations/current returns the active organisation", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.owner,
    password: FIXTURES.password,
    ip: "10.2.0.4",
  });
  const res = await client.request(organisationsHandler, "GET", "/api/v1/organisations/current", {
    csrf: false,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.id, FIXTURES.org.demo);
});

test("GET /organisations/mine lists memberships", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.owner,
    password: FIXTURES.password,
    ip: "10.2.0.5",
  });
  const res = await client.request(organisationsHandler, "GET", "/api/v1/organisations/mine", { csrf: false });
  assert.equal(res.status, 200);
  assert.ok(res.json.data.some((m) => m.organisationId === FIXTURES.org.demo));
});

test("a plain user cannot list all organisation users", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.agent,
    password: FIXTURES.password,
    ip: "10.2.0.6",
  });
  const res = await client.request(usersHandler, "GET", "/api/v1/users?pageSize=10", { csrf: false });
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, "FORBIDDEN");
});
