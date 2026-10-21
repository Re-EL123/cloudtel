/**
 * Resource integration tests (extensions, contacts, calls, settings).
 * Require DATABASE_URL (see tests/helpers/db.js).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import authHandler from "../../apps/api/api/v1/auth/[[...path]].js";
import extensionsHandler from "../../apps/api/api/v1/extensions/[[...path]].js";
import contactsHandler from "../../apps/api/api/v1/contacts/[[...path]].js";
import callsHandler from "../../apps/api/api/v1/calls/[[...path]].js";
import settingsHandler from "../../apps/api/api/v1/settings/[[...path]].js";
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

function ownerClient(ip) {
  return login(authHandler, { email: FIXTURES.email.owner, password: FIXTURES.password, ip });
}

test("GET /extensions returns an org-scoped directory", opts, async () => {
  const client = await ownerClient("10.1.0.1");
  const res = await client.request(extensionsHandler, "GET", "/api/v1/extensions?pageSize=100", {
    csrf: false,
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.data));
  const numbers = res.json.data.map((e) => e.number);
  assert.ok(numbers.includes("1001"));
  assert.ok(numbers.includes("1003"));
  for (const ext of res.json.data) {
    assert.equal(ext.sipPassword, undefined);
    assert.equal(ext.sip_password, undefined);
  }
});

test("GET /extensions/me returns only the caller's extensions", opts, async () => {
  const client = await ownerClient("10.1.0.2");
  const res = await client.request(extensionsHandler, "GET", "/api/v1/extensions/me", { csrf: false });
  assert.equal(res.status, 200);
  assert.ok(res.json.data.every((e) => e.number === undefined || e.number === "1001"));
});

test("GET /extensions/:id/telephony exposes public identifiers only", opts, async () => {
  const client = await ownerClient("10.1.0.3");
  const res = await client.request(
    extensionsHandler,
    "GET",
    `/api/v1/extensions/${FIXTURES.extension.owner}/telephony`,
    { csrf: false }
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.data.sipPassword, undefined);
  assert.equal(res.json.data.secret, undefined);
});

test("GET /contacts returns org contacts visible to the caller", opts, async () => {
  const client = await ownerClient("10.1.0.4");
  const res = await client.request(contactsHandler, "GET", "/api/v1/contacts?pageSize=50", { csrf: false });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.data));
});

test("contact favourite toggle round-trips", opts, async () => {
  const client = await ownerClient("10.1.0.5");
  const list = await client.request(contactsHandler, "GET", "/api/v1/contacts?pageSize=50", { csrf: false });
  const contact = list.json.data[0];
  if (!contact) return;

  const added = await client.request(contactsHandler, "POST", `/api/v1/contacts/${contact.id}/favourite`, {});
  assert.equal(added.status, 200);
  const favourites = await client.request(contactsHandler, "GET", "/api/v1/contacts/favourites", {
    csrf: false,
  });
  assert.equal(favourites.status, 200);
  assert.ok(favourites.json.data.some((c) => c.id === contact.id));

  const removed = await client.request(contactsHandler, "DELETE", `/api/v1/contacts/${contact.id}/favourite`, {});
  assert.equal(removed.status, 200);
});

test("GET /contacts/search filters by query", opts, async () => {
  const client = await ownerClient("10.1.0.6");
  const res = await client.request(contactsHandler, "GET", "/api/v1/contacts/search?q=zzz-no-such-contact", {
    csrf: false,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data, []);
});

test("GET /calls returns the caller's history only", opts, async () => {
  const client = await ownerClient("10.1.0.7");
  const res = await client.request(callsHandler, "GET", "/api/v1/calls?includeActive=true", { csrf: false });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.data));
});

test("GET /calls/stats returns aggregate counters", opts, async () => {
  const client = await ownerClient("10.1.0.8");
  const res = await client.request(callsHandler, "GET", "/api/v1/calls/stats", { csrf: false });
  assert.equal(res.status, 200);
  assert.equal(typeof res.json.data, "object");
});

test("POST /calls records a browser-originated call and PATCH finalises it", opts, async () => {
  const client = await ownerClient("10.1.0.9");
  const created = await client.request(callsHandler, "POST", "/api/v1/calls", {
    body: {
      remoteNumber: "27821234567",
      displayName: "Integration Test",
      direction: "outgoing",
      startedAt: new Date(Date.now() - 5000).toISOString(),
      providerCallId: `it-${Date.now()}`,
    },
  });
  assert.equal(created.status, 200);
  const callId = created.json.data.id;
  assert.ok(callId);

  const patched = await client.request(callsHandler, "PATCH", `/api/v1/calls/${callId}`, {
    body: {
      answeredAt: new Date(Date.now() - 4000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: 4,
      disposition: "answered",
    },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.data.disposition, "answered");
  assert.equal(patched.json.data.duration_seconds, 4);
});

test("GET /settings returns preferences for the caller", opts, async () => {
  const client = await ownerClient("10.1.0.10");
  const res = await client.request(settingsHandler, "GET", "/api/v1/settings", { csrf: false });
  assert.equal(res.status, 200);
});

test("PATCH /settings/audio persists device preferences", opts, async () => {
  const client = await ownerClient("10.1.0.11");
  const res = await client.request(settingsHandler, "PATCH", "/api/v1/settings/audio", {
    body: { inputDeviceId: "test-input", outputDeviceId: "test-output" },
  });
  assert.equal(res.status, 200);
  const read = await client.request(settingsHandler, "GET", "/api/v1/settings/audio", { csrf: false });
  assert.equal(read.status, 200);
  assert.equal(read.json.data.inputDeviceId, "test-input");
});
