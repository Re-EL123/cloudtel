/**
 * Tenant isolation and authorisation security tests. Require DATABASE_URL.
 *
 * These assertions are the security contract: a user in one organisation must
 * never be able to read or mutate another organisation's rows, regardless of
 * what ids they supply.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import authHandler from "../../apps/api/api/v1/auth/[[...path]].js";
import extensionsHandler from "../../apps/api/api/v1/extensions/[[...path]].js";
import contactsHandler from "../../apps/api/api/v1/contacts/[[...path]].js";
import callsHandler from "../../apps/api/api/v1/calls/[[...path]].js";
import usersHandler from "../../apps/api/api/v1/users/[[...path]].js";
import organisationsHandler from "../../apps/api/api/v1/organisations/[[...path]].js";
import { hasDatabase, prepareDatabase, resetTransient, closeDatabase, FIXTURES } from "../helpers/db.js";
import { login, anonymous } from "../helpers/session.js";

const opts = { skip: !hasDatabase };

before(async () => {
  if (!hasDatabase) return;
  await prepareDatabase();
  await resetTransient();
});

after(async () => {
  await closeDatabase();
});

function demoOwner(ip) {
  return login(authHandler, { email: FIXTURES.email.owner, password: FIXTURES.password, ip });
}
function acmeOwner(ip) {
  return login(authHandler, { email: FIXTURES.email.acmeOwner, password: FIXTURES.password, ip });
}

test("a demo user cannot read an Acme extension", opts, async () => {
  const client = await demoOwner("10.3.0.1");
  const res = await client.request(
    extensionsHandler,
    "GET",
    `/api/v1/extensions/${FIXTURES.extension.acme}/telephony`,
    { csrf: false }
  );
  assert.equal(res.status, 404);
});

test("a demo user cannot disable an Acme extension", opts, async () => {
  const client = await demoOwner("10.3.0.2");
  const res = await client.request(extensionsHandler, "POST", `/api/v1/extensions/${FIXTURES.extension.acme}/disable`, {});
  assert.equal(res.status, 404);
});

test("extension directory is org-scoped", opts, async () => {
  const client = await demoOwner("10.3.0.3");
  const res = await client.request(extensionsHandler, "GET", "/api/v1/extensions?pageSize=100", { csrf: false });
  const numbers = res.json.data.map((e) => e.number);
  assert.ok(numbers.includes("1001"));
  assert.ok(!numbers.includes("2001"), "Acme extension leaked into demo directory");
});

test("call history never includes another organisation's calls", opts, async () => {
  const client = await demoOwner("10.3.0.4");
  const res = await client.request(callsHandler, "GET", "/api/v1/calls?includeActive=true&pageSize=100", {
    csrf: false,
  });
  assert.equal(res.status, 200);
  const orgIds = new Set(res.json.data.map((c) => c.organisation_id || c.organisationId));
  orgIds.delete(undefined);
  assert.ok(!orgIds.has(FIXTURES.org.acme), "Acme call leaked into demo history");
});

test("a demo user cannot read an unknown call by id", opts, async () => {
  const client = await demoOwner("10.3.0.5");
  const res = await client.request(
    callsHandler,
    "GET",
    "/api/v1/calls/11111111-2222-4333-8444-555555555555",
    { csrf: false }
  );
  assert.ok([403, 404].includes(res.status));
});

test("a non-admin cannot change organisation settings", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.agent,
    password: FIXTURES.password,
    ip: "10.3.0.6",
  });
  const res = await client.request(organisationsHandler, "PATCH", "/api/v1/organisations/current", {
    body: { name: "Hacked Ltd" },
  });
  assert.equal(res.status, 403);
});

test("a non-admin cannot suspend another user", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.agent,
    password: FIXTURES.password,
    ip: "10.3.0.7",
  });
  const res = await client.request(usersHandler, "POST", `/api/v1/users/${FIXTURES.user.admin}/suspend`, {});
  assert.ok([403, 404].includes(res.status));
});

test("cross-tenant member mutation is rejected", opts, async () => {
  const client = await demoOwner("10.3.0.8");
  const res = await client.request(
    organisationsHandler,
    "PATCH",
    `/api/v1/organisations/${FIXTURES.org.demo}/members/${FIXTURES.user.acmeOwner}`,
    { body: { role: "admin" } }
  );
  assert.ok([403, 404].includes(res.status));
});

test("contacts are not readable across organisations", opts, async () => {
  const acme = await acmeOwner("10.3.0.9");
  const res = await acme.request(contactsHandler, "GET", "/api/v1/contacts?pageSize=100", { csrf: false });
  assert.equal(res.status, 200);
  const orgIds = new Set(res.json.data.map((c) => c.organisation_id || c.organisationId));
  orgIds.delete(undefined);
  assert.ok(!orgIds.has(FIXTURES.org.demo), "Demo contact leaked into Acme contacts");
});

test("unauthenticated access to protected routes is 401", opts, async () => {
  const anon = anonymous(extensionsHandler, "10.3.0.10");
  const res = await anon.request("GET", "/api/v1/extensions");
  assert.equal(res.status, 401);
});

test("a platform admin can authenticate across organisations", opts, async () => {
  const client = await login(authHandler, {
    email: FIXTURES.email.platform,
    password: FIXTURES.password,
    ip: "10.3.0.11",
  });
  assert.equal(client.data.role, "platform_admin");
});
