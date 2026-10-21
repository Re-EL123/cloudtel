/**
 * CloudTel shared constants. Used by the browser and the serverless API.
 * Keep this module dependency-free so it can run in any environment.
 */

export const APP_NAME = "CloudTel";
export const APP_COMPANY = "Re-EL Branding & Technologies";
export const API_VERSION = "v1";
export const DEFAULT_TIMEZONE = "Africa/Johannesburg";

export const CALL_DIRECTIONS = Object.freeze({
  INCOMING: "incoming",
  OUTGOING: "outgoing",
});

export const CALL_DISPOSITIONS = Object.freeze({
  ANSWERED: "answered",
  MISSED: "missed",
  DECLINED: "declined",
  BUSY: "busy",
  FAILED: "failed",
  CANCELLED: "cancelled",
  NO_ANSWER: "no_answer",
  VOICEMAIL: "voicemail",
});

/** Group dispositions into the categories shown in the call history UI. */
export const DISPOSITION_GROUPS = Object.freeze({
  answered: [CALL_DISPOSITIONS.ANSWERED],
  missed: [CALL_DISPOSITIONS.MISSED, CALL_DISPOSITIONS.NO_ANSWER],
  declined: [CALL_DISPOSITIONS.DECLINED],
  failed: [CALL_DISPOSITIONS.FAILED],
  cancelled: [CALL_DISPOSITIONS.CANCELLED],
  busy: [CALL_DISPOSITIONS.BUSY],
  voicemail: [CALL_DISPOSITIONS.VOICEMAIL],
});

export const CALL_SOURCES = Object.freeze({
  BROWSER: "browser",
  PBX: "pbx",
  PROVIDER: "provider",
  SYSTEM: "system",
});

export const PROVISIONING_STATES = Object.freeze({
  PENDING: "pending",
  PROVISIONING: "provisioning",
  READY: "ready",
  FAILED: "failed",
  DISABLED: "disabled",
});

export const EXTENSION_STATUSES = Object.freeze({
  ACTIVE: "active",
  DISABLED: "disabled",
  REVOKED: "revoked",
});

export const CONTACT_SCOPES = Object.freeze({
  PERSONAL: "personal",
  ORGANISATION: "organisation",
});

export const MEMBER_ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  USER: "user",
  AUDITOR: "auditor",
});

export const USER_STATUSES = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  INVITED: "invited",
  DEACTIVATED: "deactivated",
});

export const THEMES = Object.freeze({
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
});

export const CALL_STATES = Object.freeze({
  IDLE: "idle",
  INCOMING: "incoming",
  INITIATING: "initiating",
  RINGING: "ringing",
  CONNECTING: "connecting",
  ACTIVE: "active",
  HELD: "held",
  ENDED: "ended",
  FAILED: "failed",
});

export const REGISTRATION_STATES = Object.freeze({
  UNREGISTERED: "unregistered",
  CONNECTING: "connecting",
  REGISTERING: "registering",
  REGISTERED: "registered",
  REGISTRATION_ERROR: "registration_error",
  RETRY_WAIT: "retry_wait",
  DISCONNECTED: "disconnected",
  RECONNECTING: "reconnecting",
});

export const AUTH_STATES = Object.freeze({
  UNAUTHENTICATED: "unauthenticated",
  AUTHENTICATING: "authenticating",
  AUTHENTICATED: "authenticated",
  SESSION_EXPIRED: "session_expired",
});

export const PAGINATION = Object.freeze({
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
});

export const LIMITS = Object.freeze({
  NAME_MAX: 120,
  DISPLAY_NAME_MAX: 80,
  EMAIL_MAX: 254,
  NOTES_MAX: 2000,
  PASSWORD_MIN: 10,
  PASSWORD_MAX: 200,
  PHONE_MAX: 32,
  NUMBER_INPUT_MAX: 64,
  ORGANISATION_NAME_MAX: 120,
  EXTENSION_NUMBER_MIN: 2,
  EXTENSION_NUMBER_MAX: 12,
  SUBJECT_MAX: 120,
});

export const RATE_LIMITS = Object.freeze({
  LOGIN: { windowMs: 15 * 60 * 1000, max: 5 },
  PASSWORD_RESET: { windowMs: 60 * 60 * 1000, max: 3 },
  WRITE: { windowMs: 60 * 1000, max: 120 },
  READ: { windowMs: 60 * 1000, max: 600 },
  WEBHOOK: { windowMs: 60 * 1000, max: 1200 },
});

export const SESSION = Object.freeze({
  COOKIE_NAME: "cloudtel_session",
  CSRF_COOKIE_NAME: "cloudtel_csrf",
  CSRF_HEADER: "x-csrf-token",
  DEFAULT_TTL_HOURS: 12,
});

export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export const SIP_DEFAULTS = Object.freeze({
  TRANSPORT: "WSS",
  VOICEMAIL_CODE: "*97",
});

export const DEFAULT_SETTINGS = Object.freeze({
  theme: THEMES.SYSTEM,
  compactLayout: false,
  notificationsEnabled: true,
  incomingCallSound: true,
  ringtone: "default",
  confirmOutboundCalls: false,
  preferredNumberFormat: "international",
  timezone: DEFAULT_TIMEZONE,
  locale: "en-ZA",
});
