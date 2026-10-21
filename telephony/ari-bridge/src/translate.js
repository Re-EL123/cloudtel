/**
 * Pure translation from Asterisk ARI events to the CloudTel telephony webhook
 * contract (`POST /api/v1/webhooks/telephony`).
 *
 * Emitted event types (must stay in sync with TELEPHONY_EVENTS in
 * packages/shared): call.started, call.ringing, call.answered, call.held,
 * call.resumed, call.ended, call.failed, registration.changed,
 * voicemail.deposited.
 *
 * Webhook payload fields consumed by the server:
 *   type, callId, direction, callerNumber, calleeNumber, callerName,
 *   extension, startedAt, answeredAt, endedAt, hangupCause, billableSeconds,
 *   declined, busy, voicemail, failed, occurredAt, eventId, organisationId.
 */

const HELD_BRIDGE_STATES = new Set(["held"]);

function pickChannel(event) {
  return event.channel || event;
}

/** The party this channel is connected to (the callee). */
function channelNumber(channel) {
  if (!channel) return undefined;
  return channel.connected?.number || channel.dialplan?.exten || channel.caller?.number || undefined;
}

/** The party that originated the channel (the caller). */
function callerNumber(channel) {
  if (!channel) return undefined;
  return channel.caller?.number || channel.caller?.dialplan?.exten || undefined;
}

function callerName(channel) {
  if (!channel) return undefined;
  return channel.caller?.name || undefined;
}

function iso(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function channelId(channel) {
  return channel?.id || channel?.name || undefined;
}

/**
 * Translate a single ARI event into a webhook payload.
 * Returns `null` for events that have no CloudTel representation.
 */
export function translateAriEvent(event, { config = {} } = {}) {
  if (!event || !event.type) return null;

  const channel = pickChannel(event);
  const callId = channelId(channel) || event.channelId;
  const extension =
    event.endpoint?.resource || channel?.dialplan?.exten || channelNumber(channel) || undefined;
  const base = {
    callId,
    extension,
    organisationId: config.organisationId,
    eventId: event.eventId || `${event.type}:${callId || "unknown"}:${event.timestamp || ""}`,
    occurredAt: iso(event.timestamp) || new Date().toISOString(),
  };

  switch (event.type) {
    case "StasisStart": {
      const direction = channel?.dialplan?.app_data?.includes("outbound") ? "outgoing" : "incoming";
      return {
        ...base,
        type: "call.started",
        direction,
        callerNumber: callerNumber(channel),
        calleeNumber: channelNumber(channel),
        callerName: callerName(channel),
        startedAt: base.occurredAt,
      };
    }

    case "ChannelStateChange": {
      const state = channel?.state;
      if (state === "Ringing" || state === "Ring") {
        return { ...base, type: "call.ringing", direction: directionOf(channel) };
      }
      if (state === "Up") {
        return {
          ...base,
          type: "call.answered",
          answeredAt: base.occurredAt,
          callerNumber: callerNumber(channel),
          calleeNumber: channelNumber(channel),
        };
      }
      return null;
    }

    case "ChannelDtmfReceived":
      // DTMF is handled in-app; no call record side effect.
      return null;

    case "BridgeCreated":
    case "BridgeDestroyed": {
      const state = event.bridge?.state;
      if (HELD_BRIDGE_STATES.has(state)) {
        return { ...base, type: "call.held", heldAt: base.occurredAt };
      }
      if (event.type === "BridgeDestroyed") {
        return { ...base, type: "call.resumed", resumedAt: base.occurredAt };
      }
      return null;
    }

    case "ChannelHangupRequest":
      // Asterisk emits this before ChannelDestroyed; the definitive end is
      // ChannelDestroyed. Ignore to avoid double-emit.
      return null;

    case "ChannelDestroyed": {
      const cause = channel?.hangupCause ?? event.cause;
      const answered = channel?.state === "Up";
      return {
        ...base,
        type: "call.ended",
        endedAt: base.occurredAt,
        answeredAt: answered ? undefined : undefined,
        hangupCause: cause !== undefined && cause !== null ? String(cause) : undefined,
        failed: isFailedCause(cause),
      };
    }

    case "StasisEnd":
      return {
        ...base,
        type: "call.ended",
        endedAt: base.occurredAt,
        hangupCause: event._stasisEnd ? event.cause : undefined,
      };

    case "RecordingFinished":
    case "PlaybackFinished": {
      if (event.recording?.state === "failed") {
        return { ...base, type: "call.failed", failedAt: base.occurredAt };
      }
      return null;
    }

    case "ContactStatusChange": {
      const resource = event.endpoint?.resource || channel?.name;
      return {
        type: "registration.changed",
        extension: resource,
        registered: event.endpoint?.state === "online",
        organisationId: config.organisationId,
        eventId: base.eventId,
        occurredAt: base.occurredAt,
      };
    }

    default:
      return null;
  }
}

function directionOf(channel) {
  const data = channel?.dialplan?.app_data || "";
  return data.includes("outbound") ? "outgoing" : "incoming";
}

const FAILED_CAUSES = new Set(["FAILED", "NETWORK_OUT_OF_ORDER", "NORMAL_TEMPORARY_FAILURE", "CONGESTION"]);

function isFailedCause(cause) {
  if (cause === undefined || cause === null) return false;
  return FAILED_CAUSES.has(String(cause));
}

/** Build a `voicemail.deposited` payload from an app-level recording hook. */
export function voicemailDeposited({ callId, extension, recordingName, durationSeconds, occurredAt, config = {} }) {
  return {
    type: "voicemail.deposited",
    callId,
    extension,
    voicemailDuration: durationSeconds,
    recordingName,
    recordingUrl: config.recordingBaseUrl ? `${config.recordingBaseUrl}/${recordingName}` : undefined,
    organisationId: config.organisationId,
    occurredAt: occurredAt || new Date().toISOString(),
  };
}
