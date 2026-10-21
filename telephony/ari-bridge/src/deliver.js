/**
 * Signed webhook delivery with bounded exponential backoff.
 *
 * The signature scheme matches `apps/api/lib/webhook-signature.js`:
 *   X-Webhook-Timestamp: unix seconds
 *   X-Webhook-Signature: v1=<hex hmac-sha256(timestamp + "." + rawBody)>
 *   X-Event-Id:          unique event id (server-side dedupe key)
 */
import { createHmac, randomUUID } from "node:crypto";

export function signatureHeaders(rawBody, secret, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return {
    "X-Webhook-Timestamp": String(timestampSeconds),
    "X-Webhook-Signature": `v1=${digest}`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWebhookDeliverer({
  config,
  logger = console,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  randomId = () => randomUUID(),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for webhook delivery.");
  }

  async function deliver(payload) {
    const rawBody = JSON.stringify(payload);
    const headers = {
      "Content-Type": "application/json",
      "X-Event-Id": payload.eventId || randomId(),
      ...signatureHeaders(rawBody, config.webhookSecret, Math.floor(now() / 1000)),
    };

    const maxRetries = Number.isFinite(config.maxRetries) ? config.maxRetries : 5;
    let attempt = 0;
    let lastError;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs || 5000);
      try {
        const response = await fetchImpl(config.webhookUrl, {
          method: "POST",
          headers,
          body: rawBody,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) return { status: response.status };
        // 4xx (other than 429) are permanent; do not retry.
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw Object.assign(new Error(`Webhook rejected with ${response.status}`), { permanent: true });
        }
        lastError = new Error(`Webhook responded ${response.status}`);
      } catch (error) {
        clearTimeout(timeout);
        if (error.permanent) throw error;
        lastError = error;
      }
      attempt += 1;
      if (attempt > maxRetries) break;
      const backoff = Math.min(30000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      logger.warn?.(`[ari-bridge] retry ${attempt}/${maxRetries} after ${backoff}ms: ${lastError.message}`);
      await sleep(backoff);
    }
    throw lastError || new Error("Webhook delivery failed");
  }

  return deliver;
}
