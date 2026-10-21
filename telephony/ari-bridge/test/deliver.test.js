import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signatureHeaders, createWebhookDeliverer } from "../src/deliver.js";

test("signatureHeaders produces a verifiable v1 signature", () => {
  const body = JSON.stringify({ type: "call.started" });
  const headers = signatureHeaders(body, "s3cret", 1700000000);
  const expected = createHmac("sha256", "s3cret").update(`1700000000.${body}`).digest("hex");
  assert.equal(headers["X-Webhook-Timestamp"], "1700000000");
  assert.equal(headers["X-Webhook-Signature"], `v1=${expected}`);
});

test("deliver posts a signed body and returns status on success", async () => {
  const calls = [];
  const deliver = createWebhookDeliverer({
    config: { webhookUrl: "https://api.test/webhooks/telephony", webhookSecret: "s3cret", maxRetries: 0, requestTimeoutMs: 1000 },
    logger: {},
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 202 };
    },
    now: () => 1700000000000,
    randomId: () => "evt-fixed",
  });
  const result = await deliver({ type: "call.started", eventId: "evt-1" });
  assert.equal(result.status, 202);
  assert.equal(calls.length, 1);
  const options = calls[0].options;
  assert.equal(options.method, "POST");
  assert.equal(options.headers["X-Event-Id"], "evt-1");
  const expected = createHmac("sha256", "s3cret")
    .update(`1700000000.${options.body}`)
    .digest("hex");
  assert.equal(options.headers["X-Webhook-Signature"], `v1=${expected}`);
});

test("deliver retries on 5xx then succeeds", async () => {
  let n = 0;
  const deliver = createWebhookDeliverer({
    config: { webhookUrl: "https://api.test/x", webhookSecret: "s", maxRetries: 3, requestTimeoutMs: 1000 },
    logger: {},
    fetchImpl: async () => {
      n += 1;
      return n < 2 ? { ok: false, status: 503 } : { ok: true, status: 200 };
    },
    now: () => 0,
    randomId: () => "e",
  });
  const result = await deliver({ type: "call.ended" });
  assert.equal(result.status, 200);
  assert.equal(n, 2);
});

test("deliver does not retry permanent 4xx errors", async () => {
  let n = 0;
  const deliver = createWebhookDeliverer({
    config: { webhookUrl: "https://api.test/x", webhookSecret: "s", maxRetries: 3, requestTimeoutMs: 1000 },
    logger: {},
    fetchImpl: async () => {
      n += 1;
      return { ok: false, status: 422 };
    },
    now: () => 0,
    randomId: () => "e",
  });
  await assert.rejects(() => deliver({ type: "call.ended" }));
  assert.equal(n, 1);
});
