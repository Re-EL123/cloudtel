/**
 * Call manager: the single façade the UI uses for telephony.
 * It wires SIP events into the call state machine, records calls through the
 * API, and exposes place/answer/hangup/hold/mute/transfer operations.
 *
 * The browser is never the source of billing truth — every completed call is
 * reported to POST /calls and the PBX webhooks reconcile it (AGENTS.md §5).
 */
import { CALL_DIRECTIONS, CALL_STATES, REGISTRATION_STATES } from "../shared/index.js";
import { emit, on } from "../core/event-bus.js";
import { setState } from "../core/state.js";
import { callsApi, callControlApi, extensionsApi, settingsApi } from "../core/endpoints.js";
import { handleError } from "../core/error-handler.js";
import { notifyWarning } from "../ui/notifications.js";
import * as sip from "./sip-client.js";
import * as callState from "./call-state.js";
import * as audio from "./audio.js";
import { resolveDialTarget, sendDtmf } from "./dtmf.js";

let initialised = false;
let remoteAudio = null;
let extensionNumbers = [];
let pendingInvitation = null;
let ringbackTimer = null;

/** Create (or reuse) the <audio> element that plays the far end. */
function ensureRemoteAudio() {
  if (remoteAudio && document.body.contains(remoteAudio)) return remoteAudio;
  remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  remoteAudio.playsInline = true;
  remoteAudio.className = "visually-hidden";
  document.body.append(remoteAudio);
  return remoteAudio;
}

/** Initialise telephony from the user's settings and login. */
export async function initTelephony() {
  if (initialised) return;
  initialised = true;

  sip.setRemoteVideoElementFactory(() => ensureRemoteAudio());

  on("sip:registration", ({ state, error }) => {
    setState({ registrationStatus: state, registrationError: error || null });
  });

  on("sip:invite", ({ invitation }) => handleIncoming(invitation));
  on("sip:answered", () => {
    callState.markAnswered();
    stopRingback();
  });
  on("sip:hangup", ({ session }) => handleRemoteHangup(session));

  await loadExtensionNumbers();
  await registerFromSettings();
  audio.watchDevices((devices) => emit("audio:devices", devices));
}

/** Fetch the organisation's extensions for internal dial detection. */
async function loadExtensionNumbers() {
  try {
    const result = await extensionsApi.list({ pageSize: 100 });
    extensionNumbers = (result?.items || result || []).map((e) => e.number).filter(Boolean);
  } catch {
    extensionNumbers = [];
  }
}

/** Register using the telephony configuration issued by the server. */
export async function registerFromSettings() {
  let config;
  try {
    config = await settingsApi.telephony();
  } catch (error) {
    setState({ registrationStatus: REGISTRATION_STATES.REGISTRATION_ERROR, registrationError: "Telephony is not configured." });
    return false;
  }
  if (!config?.configured) {
    setState({ registrationStatus: REGISTRATION_STATES.UNREGISTERED, registrationError: "No extension assigned." });
    return false;
  }
  try {
    await sip.connect({
      uri: config.sipUri,
      wsUrl: config.wsUrl,
      password: config.password,
      displayName: config.displayName,
      iceServers: config.iceServers || [],
    });
    setState({ sipUri: config.sipUri });
    return true;
  } catch (error) {
    setState({ registrationStatus: REGISTRATION_STATES.REGISTRATION_ERROR, registrationError: error?.message });
    return false;
  }
}

export async function unregister() {
  await sip.disconnect();
}

/** Place an outbound call. */
export async function placeCall(rawTarget, { displayName = "" } = {}) {
  if (callState.hasLiveCall()) {
    notifyWarning("Finish the current call before starting another.");
    return null;
  }
  if (!sip.isRegistered()) {
    notifyWarning("The softphone is not registered yet. Check Settings → Telephony.");
    return null;
  }

  const target = resolveDialTarget(rawTarget, { extensionNumbers });
  if (!target) {
    notifyWarning("Enter a number or extension to call.");
    return null;
  }

  const call = callState.beginCall({
    direction: CALL_DIRECTIONS.OUTGOING,
    remoteNumber: target,
    displayName: displayName || target,
  });

  try {
    const session = await sip.call(target);
    callState.attachSipSession(session);
    callState.transition(CALL_STATES.RINGING);
    startRingback();
    wireSession(session);
    return call;
  } catch (error) {
    callState.endCall({ failed: true, terminatedBy: "local", cause: error?.cause });
    handleError(error);
    return null;
  }
}

function startRingback() {
  stopRingback();
  audio.playTone("ringback");
  ringbackTimer = setInterval(() => {
    if (callState.getCurrentCall()?.state === CALL_STATES.RINGING) audio.playTone("ringback");
    else stopRingback();
  }, 4000);
}

function stopRingback() {
  if (ringbackTimer) clearInterval(ringbackTimer);
  ringbackTimer = null;
}

function wireSession(session) {
  // SIP.js emits events via delegates set in sip-client; here we attach to the
  // media session description handler for connectionstate changes.
  const sdh = session?.sessionDescriptionHandler;
  if (sdh?.peerConnection) {
    sdh.peerConnection.addEventListener("connectionstatechange", () => {
      const cs = sdh.peerConnection.connectionState;
      if (cs === "connected" && callState.getCurrentCall()) {
        callState.markAnswered();
      }
      if (cs === "failed") {
        callState.endCall({ failed: true });
      }
    });
  }
}

/** Incoming call handling. */
function handleIncoming(invitation) {
  if (callState.hasLiveCall()) {
    // Single-call softphone: politely reject a second call with 486 Busy.
    try {
      invitation.reject?.({ statusCode: 486 });
    } catch {
      /* ignore */
    }
    return;
  }
  pendingInvitation = invitation;
  const remote = invitation.remoteIdentity?.uri?.user || "Unknown";
  const display = invitation.remoteIdentity?.displayName || remote;
  callState.beginCall({
    direction: CALL_DIRECTIONS.INCOMING,
    remoteNumber: remote,
    displayName: display,
  });
  const session = invitation;
  callState.attachSipSession(session);
  audio.playTone("ring");
  emit("call:incoming", callState.getCurrentCall());
  playIncomingRing();
}

let incomingRingTimer = null;
function playIncomingRing() {
  clearInterval(incomingRingTimer);
  audio.playTone("ring");
  incomingRingTimer = setInterval(() => {
    if (callState.getCurrentCall()?.state === CALL_STATES.INCOMING) audio.playTone("ring");
    else clearInterval(incomingRingTimer);
  }, 3000);
}

function clearIncomingRing() {
  clearInterval(incomingRingTimer);
  incomingRingTimer = null;
}

/** Answer the ringing incoming call. */
export async function answerCall() {
  const call = callState.getCurrentCall();
  if (!call || call.state !== CALL_STATES.INCOMING || !pendingInvitation) return;
  clearIncomingRing();
  try {
    callState.transition(CALL_STATES.CONNECTING);
    const sdh = pendingInvitation.sessionDescriptionHandler;
    if (sdh) {
      const pc = sdh.peerConnection;
      if (pc) await audio.applyToSession({ remoteAudioElements: [ensureRemoteAudio()] });
    }
    await pendingInvitation.accept();
    wireIncomingMedia(pendingInvitation);
    pendingInvitation = null;
    callState.markAnswered();
  } catch (error) {
    callState.endCall({ failed: true });
    handleError(error);
  }
}

function wireIncomingMedia(session) {
  const sdh = session?.sessionDescriptionHandler;
  if (sdh?.peerConnection) {
    sdh.peerConnection.addEventListener("connectionstatechange", () => {
      if (sdh.peerConnection.connectionState === "connected" && callState.getCurrentCall()) {
        callState.markAnswered();
      }
    });
  }
}

/** Decline the incoming call without answering. */
export async function declineCall() {
  const call = callState.getCurrentCall();
  if (!call || call.state !== CALL_STATES.INCOMING) return;
  clearIncomingRing();
  try {
    await pendingInvitation?.reject?.({ statusCode: 486 });
  } catch {
    /* ignore */
  }
  pendingInvitation = null;
  const ended = callState.endCall({ declined: true, terminatedBy: "local" });
  await recordCall(ended);
}

/** Hang up (or cancel a ringing outbound call). */
export async function hangupCall({ remote = false } = {}) {
  const call = callState.getCurrentCall();
  if (!call) return;
  clearIncomingRing();
  stopRingback();

  const session = call.sipSession;
  try {
    if (call.state === CALL_STATES.INCOMING) {
      await session?.reject?.({ statusCode: 486 });
    } else if ([CALL_STATES.INITIATING, CALL_STATES.RINGING].includes(call.state)) {
      await session?.cancel?.();
    } else {
      await session?.bye?.();
    }
  } catch {
    /* teardown continues regardless */
  }

  const ended = callState.endCall({ terminatedBy: remote ? "remote" : "local" });
  audio.playTone("ended");
  await recordCall(ended);
}

function handleRemoteHangup() {
  if (!callState.getCurrentCall()) return;
  clearIncomingRing();
  stopRingback();
  const ended = callState.endCall({ terminatedBy: "remote" });
  audio.playTone("ended");
  recordCall(ended);
}

/** Hold / resume via SIP re-INVITE. */
export async function setHold(held) {
  const call = callState.getCurrentCall();
  if (!call?.sipSession) return;
  try {
    callState.markHeld(held);
    if (held && typeof call.sipSession.hold === "function") await call.sipSession.hold();
    else if (!held && typeof call.sipSession.unhold === "function") await call.sipSession.unhold();
  } catch (error) {
    callState.markHeld(!held);
    handleError(error);
  }
}

/** Local microphone mute (media level, no signalling). */
export async function setMuted(muted) {
  const call = callState.getCurrentCall();
  if (!call?.sipSession) return;
  const sdh = call.sipSession.sessionDescriptionHandler;
  const pc = sdh?.peerConnection;
  if (!pc) return;
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind === "audio") sender.track.enabled = !muted;
  }
  callState.markMuted(muted);
}

/** Send DTMF through the active session. */
export async function pressDtmf(digit) {
  const call = callState.getCurrentCall();
  if (!call) return;
  await sendDtmf(call.sipSession, digit);
}

/** Blind or attended transfer (server-mediated through call-control). */
export async function transferCall(target, { attended = false } = {}) {
  const call = callState.getCurrentCall();
  if (!call) return;
  try {
    await callControlApi.transfer(call.id, { target, attended });
    if (!attended) {
      await hangupCall();
    }
  } catch (error) {
    handleError(error);
  }
}

/** Report a finished call to the server for history and usage. */
export async function recordCall(ended) {
  if (!ended) return;
  try {
    const payload = {
      direction: ended.direction,
      remoteNumber: ended.remoteNumber,
      displayName: ended.displayName,
      disposition: ended.disposition,
      startedAt: new Date(ended.startedAt).toISOString(),
      answeredAt: ended.answeredAt ? new Date(ended.answeredAt).toISOString() : null,
      endedAt: ended.endedAt ? new Date(ended.endedAt).toISOString() : null,
      durationSeconds: ended.durationSeconds,
      source: "browser",
    };
    if (ended.serverCallId) {
      await callsApi.update(ended.serverCallId, payload);
    } else {
      await callsApi.start(payload);
    }
    emit("calls:recorded", ended);
  } catch (error) {
    // History recording is best-effort; the PBX webhook is authoritative.
    console.warn("[call-manager] failed to record call", error?.message);
  }
}

/** Snapshot helper for the UI. */
export function getSnapshot() {
  return {
    call: callState.getCurrentCall(),
    duration: callState.callDurationSeconds(),
    registered: sip.isRegistered(),
  };
}

export { callState, audio };
