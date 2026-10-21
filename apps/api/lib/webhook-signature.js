/**
 * Webhook signature verification (HMAC-SHA256) with replay protection.
 * Header contract (identical for telephony and billing sources):
 *   X-Webhook-Timestamp: unix seconds
 *   X-Webhook-Signature: v1=<hex digest>  (or a bare hex digest)
 *   X-Event-Id:          unique event identifier for deduplication
 */
import crypto from "node:crypto";
import { WEBHOOK_REPLAY_WINDOW_MS } from "@cloudtel/shared";
import { ApiError } from "./response.js";

export function verifyWebhookSignature({ rawBody, headers, secret, replayWindowMs = WEBHOOK_REPLAY_WINDOW_MS }) {
  if (!secret) {
    throw new ApiError(503, "DEPENDENCY_UNAVAILABLE", "Webhook processing is not configured.");
  }
  const timestamp = String(headers["x-webhook-timestamp"] || "");
  const provided = String(headers["x-webhook-signature"] || "");
  if (!timestamp || !provided) {
    throw new ApiError(401, "INVALID_SIGNATURE", "Missing webhook authentication headers.");
  }

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) {
    throw new ApiError(401, "INVALID_SIGNATURE", "Invalid webhook timestamp.");
  }
  const ageMs = Math.abs(Date.now() - ts * 1000);
  if (ageMs > replayWindowMs) {
    throw new ApiError(400, "REPLAY_DETECTED", "Webhook timestamp is outside the accepted window.");
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const providedDigest = provided.startsWith("v1=") ? provided.slice(3) : provided;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(String(providedDigest).trim(), "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ApiError(401, "INVALID_SIGNATURE", "Webhook signature verification failed.");
  }

  return {
    eventId: String(headers["x-event-id"] || "").slice(0, 128),
    timestamp: new Date(ts * 1000),
  };
}

/** Sign a payload the way a webhook producer should (used by the ARI bridge and tests). */
export function signWebhookPayload(rawBody, secret, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const digest = crypto.createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return {
    "X-Webhook-Timestamp": String(timestampSeconds),
    "X-Webhook-Signature": `v1=${digest}`,
  };
}
