import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../../apps/api/lib/router.js";
import { handler } from "../../apps/api/lib/response.js";
import { createRequest, createResponse, invoke } from "../helpers/harness.js";

function appWith(routes) {
  return handler(createHandler(routes));
}

async function call(app, method, url) {
  return invoke(app, createRequest({ method, url, headers: { "x-forwarded-for": "10.0.0.1" } }), createResponse());
}

const echoRoutes = [
  {
    method: "GET",
    path: "/items/me",
    auth: "public",
    handle: (ctx) => ctx.res.end(JSON.stringify({ ok: true, path: "me" })),
  },
  {
    method: "GET",
    path: "/items/:id",
    auth: "public",
    handle: (ctx) => ctx.res.end(JSON.stringify({ ok: true, params: ctx.params })),
  },
];

test("strips the /api/v1 prefix before matching", async () => {
  const app = appWith(echoRoutes);
  const out = await call(app, "GET", "/api/v1/items/me");
  assert.deepEqual(out.json, { ok: true, path: "me" });
});

test("matches without the prefix too", async () => {
  const app = appWith(echoRoutes);
  const out = await call(app, "GET", "/items/me");
  assert.deepEqual(out.json, { ok: true, path: "me" });
});

test("literal routes registered first win over param siblings", async () => {
  const app = appWith(echoRoutes);
  const out = await call(app, "GET", "/api/v1/items/me");
  assert.equal(out.json.path, "me");
});

test("param routes only match an equal number of segments", async () => {
  const app = appWith(echoRoutes);
  const two = await call(app, "GET", "/api/v1/items/42");
  assert.deepEqual(two.json.params, { id: "42" });
  const three = await call(app, "GET", "/api/v1/items/42/extra");
  assert.equal(three.status, 404);
});

test("decodeURIComponent is applied to params", async () => {
  const app = appWith(echoRoutes);
  const out = await call(app, "GET", "/api/v1/items/a%20b");
  assert.deepEqual(out.json.params, { id: "a b" });
});

test("unknown path returns 404", async () => {
  const app = appWith(echoRoutes);
  const out = await call(app, "GET", "/api/v1/nope");
  assert.equal(out.status, 404);
  assert.equal(out.json.error.code, "NOT_FOUND");
});

test("known path with wrong method returns 405", async () => {
  const app = appWith(echoRoutes);
  const out = await call(app, "POST", "/api/v1/items/me");
  assert.equal(out.status, 405);
  assert.equal(out.json.error.code, "METHOD_NOT_ALLOWED");
});

test("trailing slashes are tolerated", async () => {
  const app = appWith(echoRoutes);
  const out = await call(app, "GET", "/api/v1/items/me/");
  assert.deepEqual(out.json, { ok: true, path: "me" });
});

test("query string is parsed into ctx.query", async () => {
  const app = appWith([
    {
      method: "GET",
      path: "/q",
      auth: "public",
      handle: (ctx) => ctx.res.end(JSON.stringify(ctx.query)),
    },
  ]);
  const out = await call(app, "GET", "/api/v1/q?page=2&q=hello");
  assert.deepEqual(out.json, { page: "2", q: "hello" });
});
