import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, signWebhookPayload } from "../../apps/api/lib/webhook-signature.js";
import { ApiError } from "../../apps/api/lib/response.js";

const SECRET = "test-secret";

/** Node lowercases incoming header names; mirror that for the raw header maps. */
function lower(headers) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

test("accepts a correctly signed payload", () => {
  const body = JSON.stringify({ type: "call.started" });
  const signed = signWebhookPayload(body, SECRET, 1700000000);
  const result = verifyWebhookSignature({
    rawBody: body,
    headers: lower({ ...signed, "X-Event-Id": "evt-1" }),
    secret: SECRET,
    replayWindowMs: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(result.eventId, "evt-1");
});

test("accepts a bare (unprefixed) hex signature", () => {
  const body = "{}";
  const ts = 1700000000;
  const digest = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  const result = verifyWebhookSignature({
    rawBody: body,
    headers: { "x-webhook-timestamp": String(ts), "x-webhook-signature": digest },
    secret: SECRET,
    replayWindowMs: Number.MAX_SAFE_INTEGER,
  });
  assert.ok(result.timestamp instanceof Date);
});

test("rejects a missing signature header", () => {
  assert.throws(
    () => verifyWebhookSignature({ rawBody: "{}", headers: {}, secret: SECRET }),
    (err) => err instanceof ApiError && err.status === 401
  );
});

test("rejects a tampered body", () => {
  const signed = signWebhookPayload("{}", SECRET, 1700000000);
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: '{"tampered":true}',
        headers: lower(signed),
        secret: SECRET,
        replayWindowMs: Number.MAX_SAFE_INTEGER,
      }),
    (err) => err instanceof ApiError && err.status === 401
  );
});

test("rejects a wrong secret", () => {
  const signed = signWebhookPayload("{}", "other", 1700000000);
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: "{}",
        headers: lower(signed),
        secret: SECRET,
        replayWindowMs: Number.MAX_SAFE_INTEGER,
      }),
    (err) => err instanceof ApiError && err.status === 401
  );
});

test("rejects a stale timestamp (replay window)", () => {
  const signed = signWebhookPayload("{}", SECRET, 1);
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: "{}",
        headers: lower(signed),
        secret: SECRET,
        replayWindowMs: 5000,
      }),
    (err) => err instanceof ApiError && err.status === 400 && err.code === "REPLAY_DETECTED"
  );
});

test("throws 503 when no secret is configured", () => {
  assert.throws(
    () => verifyWebhookSignature({ rawBody: "{}", headers: {}, secret: "" }),
    (err) => err instanceof ApiError && err.status === 503
  );
});
