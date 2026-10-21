/**
 * Global browser state — the single source of truth for the UI.
 * Telephony and authentication keep their own independent state machines and
 * publish into this store; the UI only ever reads from here.
 */
import { emit, on } from "./event-bus.js";

const initialState = {
  /** @type {null | object} decoded session user */
  user: null,
  /** @type {null | object} active organisation membership */
  membership: null,
  /** @type {string | null} */
  organisationId: null,
  /** @type {string[]} permission names for the current membership */
  permissions: [],
  /** "light" | "dark" | "system" */
  theme: "system",
  /** mirrored from the telephony registration state machine */
  registrationStatus: "unregistered",
  /** last known registration error message */
  registrationError: null,
  /** current SIP URI once registered */
  sipUri: null,
  /** @type {object[]} recent calls (server-authoritative) */
  recentCalls: [],
  /** @type {object[]} contacts quick list */
  recentContacts: [],
  /** unread voicemail count badge */
  voicemailUnread: 0,
  /** context panel visibility on the dialer */
  contactPanelOpen: true,
  /** browser network state */
  online: typeof navigator === "undefined" ? true : navigator.onLine,
};

const state = { ...initialState };

/** Shallow-merge a patch and notify subscribers. */
export function setState(patch) {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] !== value) {
      state[key] = value;
      changed = true;
    }
  }
  if (changed) emit("state:changed", patch);
  return state;
}

export function getState() {
  return state;
}

export function subscribe(handler, keys = null) {
  return on("state:changed", (patch) => {
    if (!keys || keys.some((k) => k in patch)) handler(patch, state);
  });
}

/** Reset everything except UI-only preferences (used on sign-out). */
export function resetSessionState() {
  setState({
    user: null,
    membership: null,
    organisationId: null,
    permissions: [],
    registrationStatus: "unregistered",
    registrationError: null,
    sipUri: null,
    recentCalls: [],
    recentContacts: [],
    voicemailUnread: 0,
  });
}
