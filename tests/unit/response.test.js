import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  success,
  created,
  accepted,
  noContent,
  fail,
  readJsonBody,
  readRawBody,
  handler,
} from "../../apps/api/lib/response.js";
import { createRequest, createResponse, invoke } from "../helpers/harness.js";

test("success writes the standard envelope with requestId", () => {
  const res = createResponse();
  success(res, { hello: "world" }, { requestId: "req-1" });
  const payload = JSON.parse(res.body);
  assert.deepEqual(payload, {
    success: true,
    data: { hello: "world" },
    meta: { requestId: "req-1" },
  });
  assert.equal(res.statusCode, 200);
});

test("created and accepted set 201/202", () => {
  const a = createResponse();
  created(a, { id: 1 });
  assert.equal(a.statusCode, 201);
  const b = createResponse();
  accepted(b, { ok: true });
  assert.equal(b.statusCode, 202);
});

test("noContent writes 204 with no body", () => {
  const res = createResponse();
  noContent(res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.body, "");
});

test("fail writes the error envelope", () => {
  const res = createResponse();
  fail(res, 422, "VALIDATION_ERROR", "Bad input.", { email: "Required." }, "req-2");
  const payload = JSON.parse(res.body);
  assert.deepEqual(payload, {
    success: false,
    error: { code: "VALIDATION_ERROR", message: "Bad input.", fields: { email: "Required." } },
    meta: { requestId: "req-2" },
  });
});

test("readJsonBody parses a JSON body", async () => {
  const req = createRequest({ method: "POST", body: { a: 1 } });
  assert.deepEqual(await readJsonBody(req), { a: 1 });
});

test("readJsonBody returns {} for an empty body", async () => {
  const req = createRequest({ method: "POST" });
  assert.deepEqual(await readJsonBody(req), {});
});

test("readJsonBody rejects malformed JSON with 400", async () => {
  const req = createRequest({ method: "POST", body: "{not json" });
  await assert.rejects(() => readJsonBody(req), (err) => err instanceof ApiError && err.status === 400);
});

test("readRawBody enforces the size limit", async () => {
  const req = createRequest({ method: "POST", body: "x".repeat(50) });
  await assert.rejects(
    () => readRawBody(req, { limitBytes: 10 }),
    (err) => err instanceof ApiError && err.status === 413
  );
});

test("handler converts ApiError into a JSON envelope", async () => {
  const app = handler(async () => {
    throw new ApiError(403, "FORBIDDEN", "Nope.");
  });
  const req = createRequest({ method: "GET", url: "/x" });
  const res = createResponse();
  const out = await invoke(app, req, res);
  assert.equal(out.status, 403);
  assert.equal(out.json.error.code, "FORBIDDEN");
});

test("handler converts unexpected errors into a 500 envelope", async () => {
  const app = handler(async () => {
    throw new Error("boom");
  });
  const req = createRequest({ method: "GET", url: "/x" });
  const res = createResponse();
  const out = await invoke(app, req, res);
  assert.equal(out.status, 500);
  assert.equal(out.json.error.code, "INTERNAL_ERROR");
});

test("handler answers OPTIONS preflight with 204", async () => {
  const app = handler(async () => {
    throw new Error("should not run");
  });
  const req = createRequest({ method: "OPTIONS", url: "/x" });
  const res = createResponse();
  const out = await invoke(app, req, res);
  assert.equal(out.status, 204);
});

test("ApiError carries status, code, message and fields", () => {
  const err = new ApiError(422, "VALIDATION_ERROR", "msg", { a: "b" });
  assert.equal(err.status, 422);
  assert.equal(err.code, "VALIDATION_ERROR");
  assert.equal(err.message, "msg");
  assert.deepEqual(err.fields, { a: "b" });
  assert.equal(err.name, "ApiError");
});
