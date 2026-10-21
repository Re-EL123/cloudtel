/**
 * CloudTel call-state machine and disposition derivation.
 *
 * The shared transition table is used by the browser telephony layer and by
 * tests. Disposition derivation maps PBX signalling outcomes to the categories
 * stored in call_records and shown in call history.
 *
 * Unanswered calls are NOT all "missed": a local cancellation and a remote
 * rejection stay distinguishable (spec §4.7).
 */
import { CALL_STATES, CALL_DIRECTIONS, CALL_DISPOSITIONS } from "./constants.js";

const S = CALL_STATES;

/** Transient teardown states that exist inside the machine but not in CALL_STATES. */
export const TRANSIENT_STATES = Object.freeze({
  DECLINED: "declined",
  CANCELLED: "cancelled",
});

const T = TRANSIENT_STATES;

/** Allowed call-state transitions (spec §8.2). */
export const VALID_TRANSITIONS = Object.freeze({
  [S.IDLE]: Object.freeze([S.INITIATING, S.INCOMING, S.IDLE]),
  [S.INCOMING]: Object.freeze([S.CONNECTING, T.DECLINED, S.ENDED, S.FAILED, S.IDLE]),
  [S.INITIATING]: Object.freeze([S.RINGING, S.CONNECTING, S.ENDED, S.FAILED, T.CANCELLED, S.IDLE]),
  [S.RINGING]: Object.freeze([S.CONNECTING, S.ENDED, S.FAILED, T.CANCELLED, S.IDLE]),
  [S.CONNECTING]: Object.freeze([S.ACTIVE, S.ENDED, S.FAILED, S.IDLE]),
  [S.ACTIVE]: Object.freeze([S.HELD, S.ENDED, S.FAILED, S.CONNECTING, S.IDLE]),
  [S.HELD]: Object.freeze([S.ACTIVE, S.ENDED, S.FAILED, S.IDLE]),
  [S.ENDED]: Object.freeze([S.IDLE]),
  [S.FAILED]: Object.freeze([S.IDLE]),
  [T.DECLINED]: Object.freeze([S.IDLE]),
  [T.CANCELLED]: Object.freeze([S.IDLE]),
});

export function canTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid call state transition: ${from} -> ${to}`);
  }
  return to;
}

/** States in which the local media path is expected to be flowing. */
export function isActiveMediaState(state) {
  return state === S.ACTIVE || state === S.HELD;
}

/** States that still occupy the single-call slot of the softphone. */
export function isLiveState(state) {
  return (
    state !== S.IDLE &&
    state !== S.ENDED &&
    state !== S.FAILED &&
    state !== T.DECLINED &&
    state !== T.CANCELLED
  );
}

/**
 * Derive a call disposition from signalling facts.
 *
 * @param {object} facts
 * @param {"incoming"|"outgoing"} [facts.direction]
 * @param {boolean} [facts.answered]          - media was established
 * @param {string|number} [facts.hangupCause] - Asterisk/Q.850 cause code
 * @param {"local"|"remote"|"pbx"|"system"} [facts.terminatedBy]
 * @param {boolean} [facts.declined]          - explicit decline/reject by the callee
 * @param {boolean} [facts.busy]              - destination reported busy
 * @param {boolean} [facts.voicemail]         - deposit completed into voicemail
 * @param {boolean} [facts.failed]            - signalling or transport failure
 */
export function deriveDisposition(facts = {}) {
  const {
    direction = CALL_DIRECTIONS.OUTGOING,
    answered = false,
    hangupCause,
    terminatedBy,
    declined = false,
    busy = false,
    voicemail = false,
    failed = false,
  } = facts;

  const cause =
    hangupCause === null || hangupCause === undefined || hangupCause === ""
      ? null
      : Number(hangupCause);

  if (voicemail) return CALL_DISPOSITIONS.VOICEMAIL;
  if (declined) return CALL_DISPOSITIONS.DECLINED;
  if (busy || cause === 17) return CALL_DISPOSITIONS.BUSY;
  if (answered) return CALL_DISPOSITIONS.ANSWERED;

  // Unanswered or failed attempts from here down.
  if (failed || cause === 34 || cause === 38 || cause === 41 || cause === 47) {
    return CALL_DISPOSITIONS.FAILED;
  }
  if (cause === 19 || cause === 102) {
    return direction === CALL_DIRECTIONS.INCOMING
      ? CALL_DISPOSITIONS.NO_ANSWER
      : CALL_DISPOSITIONS.CANCELLED;
  }
  if (cause === 16 || cause === 31 || cause === 21) {
    if (direction === CALL_DIRECTIONS.OUTGOING) {
      return terminatedBy === "local" ? CALL_DISPOSITIONS.CANCELLED : CALL_DISPOSITIONS.MISSED;
    }
    return terminatedBy === "local" ? CALL_DISPOSITIONS.DECLINED : CALL_DISPOSITIONS.MISSED;
  }
  if (terminatedBy === "local") {
    return direction === CALL_DIRECTIONS.OUTGOING
      ? CALL_DISPOSITIONS.CANCELLED
      : CALL_DISPOSITIONS.DECLINED;
  }
  if (terminatedBy === "remote" || terminatedBy === "pbx") {
    return direction === CALL_DIRECTIONS.INCOMING
      ? CALL_DISPOSITIONS.MISSED
      : CALL_DISPOSITIONS.FAILED;
  }
  return CALL_DISPOSITIONS.FAILED;
}

const GROUPS = Object.freeze({
  answered: [CALL_DISPOSITIONS.ANSWERED],
  missed: [CALL_DISPOSITIONS.MISSED, CALL_DISPOSITIONS.NO_ANSWER],
  declined: [CALL_DISPOSITIONS.DECLINED],
  failed: [CALL_DISPOSITIONS.FAILED],
  cancelled: [CALL_DISPOSITIONS.CANCELLED],
  busy: [CALL_DISPOSITIONS.BUSY],
  voicemail: [CALL_DISPOSITIONS.VOICEMAIL],
});

/** History filter group for a disposition (used by the history screen). */
export function dispositionGroup(disposition) {
  const entry = Object.entries(GROUPS).find(([, list]) => list.includes(disposition));
  return entry ? entry[0] : "failed";
}

/** All disposition values that belong to a history filter group. */
export function dispositionsInGroup(group) {
  return GROUPS[group] || [];
}

export const DISPOSITION_GROUP_NAMES = Object.freeze(Object.keys(GROUPS));
