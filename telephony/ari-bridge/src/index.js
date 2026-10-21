/**
 * CloudTel ARI bridge.
 *
 * Connects to Asterisk's ARI WebSocket, subscribes to the Stasis application
 * that owns the CloudTel extensions, and translates ARI events into the
 * telephony webhook contract consumed by
 * `POST /api/v1/webhooks/telephony`.
 *
 * The bridge is intentionally dependency-light: every event is normalised by
 * `translate.js`, then delivered by `deliver.js`, which signs the payload with
 * the same HMAC scheme the server verifies. Keeping the translation pure makes
 * the whole pipeline unit-testable without a live Asterisk.
 */
import { translateAriEvent } from "./translate.js";
import { createWebhookDeliverer } from "./deliver.js";
import { loadConfig } from "./config.js";

const LEGACY_EVENTS = ["EndpointStateChange", "ChannelStateChange", "ChannelDestroyed"];

/**
 * Wire an ari-client instance (or any EventEmitter exposing `.on`) to the
 * CloudTel webhook endpoint. Returns a `stop()` function for graceful shutdown.
 */
export function attachBridge(client, { deliver, logger = console, config = {} } = {}) {
  const seen = new Set();

  const forward = async (ariEvent) => {
    const payload = translateAriEvent(ariEvent, { config });
    if (!payload) return;
    // ARI can replay events after a reconnect; de-dupe in-memory by event id.
    if (payload.eventId && seen.has(payload.eventId)) return;
    if (payload.eventId) {
      seen.add(payload.eventId);
      if (seen.size > 5000) seen.clear();
    }
    try {
      await deliver(payload);
      logger.debug?.(`[ari-bridge] delivered ${payload.type} (${payload.callId || "n/a"})`);
    } catch (error) {
      logger.error?.(`[ari-bridge] delivery failed for ${payload.type}: ${error.message}`);
    }
  };

  const handler = (event, channel) => {
    // ari-client passes (event, channel) for channel events.
    void forward(channel ? { ...event, channel } : event);
  };

  client.on("StasisStart", handler);
  client.on("StasisEnd", (event, channel) => void forward({ ...event, channel, _stasisEnd: true }));
  client.on("ChannelStateChange", handler);
  client.on("ChannelDtmfReceived", handler);
  client.on("ChannelHangupRequest", handler);
  client.on("ChannelDestroyed", handler);
  client.on("Dial", handler);
  client.on("BridgeCreated", handler);
  client.on("BridgeDestroyed", handler);
  client.on("PlaybackFinished", handler);
  client.on("RecordingFinished", handler);
  client.on("ContactStatusChange", handler);
  for (const name of LEGACY_EVENTS) client.on(name, handler);

  return {
    stop() {
      for (const name of [
        "StasisStart",
        "StasisEnd",
        "ChannelStateChange",
        "ChannelDtmfReceived",
        "ChannelHangupRequest",
        "ChannelDestroyed",
        "Dial",
        "BridgeCreated",
        "BridgeDestroyed",
        "PlaybackFinished",
        "RecordingFinished",
        "ContactStatusChange",
        ...LEGACY_EVENTS,
      ]) {
        client.removeAllListeners?.(name);
      }
    },
  };
}

async function main() {
  const config = loadConfig(process.env);
  const deliver = createWebhookDeliverer({ config, logger: console });

  const ari = await import("ari-client");
  const client = await ari.connect(config.ariUrl, config.ariUser, config.ariPassword);
  const bridge = attachBridge(client, { deliver, logger: console, config });

  client.start(config.stasisApp);
  console.log(`[ari-bridge] connected to ${config.ariUrl}, app=${config.stasisApp}`);

  const shutdown = async () => {
    console.log("[ari-bridge] shutting down");
    bridge.stop();
    try {
      await client.stop?.();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((error) => {
    console.error(`[ari-bridge] fatal: ${error.stack || error.message}`);
    process.exit(1);
  });
}
