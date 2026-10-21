/**
 * The call state machine. Owns the authoritative local call state, enforces
 * the transition table in packages/shared, keeps the duration timer and
 * publishes every change on the event bus.
 */
import { CALL_STATES, CALL_DIRECTIONS, deriveDisposition } from "../shared/index.js";
import { assertTransition, canTransition, isLiveState, TRANSIENT_STATES } from "../shared/call-status.js";
import { emit } from "../core/event-bus.js";
import { uid } from "../core/utils.js";

/** @typedef {{ id:string, direction:string, remoteNumber:string, displayName:string, state:string,
 *   startedAt:number, answeredAt:number|null, endedAt:number|null, muted:boolean, held:boolean,
 *   recording:boolean, cause?:string|null, terminatedBy?:string, sipSession?:object|null }} CallSession */

/** @type {CallSession|null} single-call slot (the spec is a one-call softphone) */
let current = null;
let ticker = null;

function notifyChange(reason) {
  emit("call:changed", { call: current, reason });
}

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    if (current) emit("call:tick", { id: current.id, duration: callDurationSeconds() });
  }, 1000);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

export function getCurrentCall() {
  return current;
}

export function hasLiveCall() {
  return Boolean(current && isLiveState(current.state));
}

export function callDurationSeconds() {
  if (!current) return 0;
  const from = current.answeredAt || current.startedAt;
  const until = current.endedAt || Date.now();
  return Math.max(0, Math.round((until - from) / 1000));
}

/**
 * Begin a new call session, replacing any finished one.
 * @param {{direction:string, remoteNumber:string, displayName?:string}} params
 */
export function beginCall({ direction, remoteNumber, displayName = "" }) {
  if (hasLiveCall()) {
    throw new Error("A call is already in progress.");
  }
  current = {
    id: uid("call"),
    direction,
    remoteNumber: remoteNumber || "",
    displayName: displayName || remoteNumber || "",
    state: direction === CALL_DIRECTIONS.INCOMING ? CALL_STATES.INCOMING : CALL_STATES.INITIATING,
    startedAt: Date.now(),
    answeredAt: null,
    endedAt: null,
    muted: false,
    held: false,
    recording: false,
    cause: null,
    terminatedBy: null,
    sipSession: null,
  };
  startTicker();
  notifyChange("begin");
  return current;
}

export function attachSipSession(session) {
  if (!current) return;
  current.sipSession = session;
  notifyChange("session");
}

/**
 * Move the machine to a new state. Invalid transitions are rejected loudly,
 * which surfaced early during development of the regression suite.
 */
export function transition(nextState, patch = {}) {
  if (!current) throw new Error("No active call to transition.");
  if (current.state === nextState) {
    Object.assign(current, patch);
    return current;
  }
  if (!canTransition(current.state, nextState)) {
    console.warn(`[call-state] rejected transition ${current.state} -> ${nextState}`);
    return current;
  }
  assertTransition(current.state, nextState);
  current.state = nextState;
  Object.assign(current, patch);
  if (nextState === CALL_STATES.ACTIVE && !current.answeredAt) {
    current.answeredAt = Date.now();
  }
  notifyChange("transition");
  return current;
}

export function setStateDirect(nextState, patch = {}) {
  if (!current) return null;
  current.state = nextState;
  Object.assign(current, patch);
  notifyChange("state");
  return current;
}

export function markAnswered() {
  if (!current) return;
  current.answeredAt = current.answeredAt || Date.now();
  transition(CALL_STATES.ACTIVE);
}

export function markHeld(held) {
  if (!current) return;
  current.held = held;
  if (held && current.state === CALL_STATES.ACTIVE) transition(CALL_STATES.HELD);
  else if (!held && current.state === CALL_STATES.HELD) transition(CALL_STATES.ACTIVE);
}

export function markMuted(muted) {
  if (!current) return;
  current.muted = Boolean(muted);
  notifyChange("mute");
}

export function markRecording(recording) {
  if (!current) return;
  current.recording = Boolean(recording);
  notifyChange("recording");
}

/**
 * Finalise the call and compute its disposition for the history record.
 * @param {{cause?:string|null, terminatedBy?:string, declined?:boolean, busy?:boolean, failed?:boolean, voicemail?:boolean}} outcome
 */
export function endCall(outcome = {}) {
  if (!current) return null;
  const answered = Boolean(current.answeredAt);
  const finalState = outcome.failed ? CALL_STATES.FAILED : CALL_STATES.ENDED;

  const snapshot = { ...current };
  snapshot.endedAt = Date.now();
  snapshot.state = finalState;

  snapshot.disposition = deriveDisposition({
    direction: snapshot.direction,
    answered,
    hangupCause: outcome.cause ?? snapshot.cause,
    terminatedBy: outcome.terminatedBy || snapshot.terminatedBy || "local",
    declined: Boolean(outcome.declined),
    busy: Boolean(outcome.busy),
    failed: Boolean(outcome.failed),
    voicemail: Boolean(outcome.voicemail),
  });

  snapshot.durationSeconds = current.answeredAt
    ? Math.max(0, Math.round((snapshot.endedAt - current.answeredAt) / 1000))
    : 0;

  current = snapshot;
  stopTicker();
  notifyChange("end");
  emit("call:ended", snapshot);

  // Release the single-call slot shortly after, once the UI has read it.
  setTimeout(() => {
    if (current && current.id === snapshot.id && !isLiveState(current.state)) {
      current = null;
      notifyChange("reset");
    }
  }, 1500);

  return snapshot;
}

export function clearCall() {
  current = null;
  stopTicker();
  notifyChange("clear");
}

export { CALL_STATES, CALL_DIRECTIONS, TRANSIENT_STATES };
