/**
 * CloudTel API contract map.
 * Single source of truth for the 12 serverless function groups and their
 * subroutes. Used by the API client, integration tests and the API reference doc.
 * The browser must only call endpoints listed here (AGENTS.md §3).
 */

export const API_PREFIX = "/api/v1";

export const API_FUNCTIONS = Object.freeze({
  AUTH: "auth",
  USERS: "users",
  ORGANISATIONS: "organisations",
  EXTENSIONS: "extensions",
  CONTACTS: "contacts",
  CALLS: "calls",
  CALL_CONTROL: "call-control",
  SETTINGS: "settings",
  ADMIN: "admin",
  WEBHOOKS: "webhooks",
  BILLING: "billing",
  HEALTH: "health",
});

export const API_FUNCTION_COUNT = Object.keys(API_FUNCTIONS).length;

/** "METHOD /api/v1/..." keys. Auth column: public | session | webhook | admin. */
export const ENDPOINTS = Object.freeze([
  // Function 1: auth
  { method: "POST", path: "/auth/login", auth: "public" },
  { method: "POST", path: "/auth/logout", auth: "session" },
  { method: "GET", path: "/auth/session", auth: "session" },
  { method: "POST", path: "/auth/password/forgot", auth: "public" },
  { method: "POST", path: "/auth/password/reset", auth: "public" },
  { method: "POST", path: "/auth/password/change", auth: "session" },

  // Function 2: users
  { method: "GET", path: "/users", auth: "session" },
  { method: "GET", path: "/users/:id", auth: "session" },
  { method: "POST", path: "/users", auth: "session" },
  { method: "PATCH", path: "/users/:id", auth: "session" },
  { method: "DELETE", path: "/users/:id", auth: "session" },

  // Function 3: organisations
  { method: "GET", path: "/organisations", auth: "session" },
  { method: "GET", path: "/organisations/:id", auth: "session" },
  { method: "POST", path: "/organisations", auth: "session" },
  { method: "PATCH", path: "/organisations/:id", auth: "session" },
  { method: "GET", path: "/organisations/:id/members", auth: "session" },

  // Function 4: extensions
  { method: "GET", path: "/extensions", auth: "session" },
  { method: "POST", path: "/extensions", auth: "session" },
  { method: "PATCH", path: "/extensions/:id", auth: "session" },
  { method: "POST", path: "/extensions/:id/disable", auth: "session" },
  { method: "POST", path: "/extensions/:id/enable", auth: "session" },

  // Function 5: contacts
  { method: "GET", path: "/contacts", auth: "session" },
  { method: "GET", path: "/contacts/:id", auth: "session" },
  { method: "POST", path: "/contacts", auth: "session" },
  { method: "PATCH", path: "/contacts/:id", auth: "session" },
  { method: "DELETE", path: "/contacts/:id", auth: "session" },

  // Function 6: calls and history
  { method: "GET", path: "/calls", auth: "session" },
  { method: "GET", path: "/calls/active", auth: "session" },
  { method: "GET", path: "/calls/voicemail", auth: "session" },
  { method: "GET", path: "/calls/:id", auth: "session" },
  { method: "GET", path: "/calls/:id/usage", auth: "session" },

  // Function 7: call control (server-authorised / PBX-backed operations)
  { method: "POST", path: "/call-control/transfer", auth: "session" },
  { method: "POST", path: "/call-control/hold", auth: "session" },
  { method: "POST", path: "/call-control/resume", auth: "session" },
  { method: "POST", path: "/call-control/hangup", auth: "session" },

  // Function 8: settings
  { method: "GET", path: "/settings", auth: "session" },
  { method: "PATCH", path: "/settings", auth: "session" },
  { method: "GET", path: "/settings/telephony", auth: "session" },
  { method: "PATCH", path: "/settings/telephony", auth: "session" },

  // Function 9: administration
  { method: "GET", path: "/admin/dashboard", auth: "session" },
  { method: "GET", path: "/admin/audit-logs", auth: "session" },
  { method: "GET", path: "/admin/usage", auth: "session" },
  { method: "POST", path: "/admin/users/:id/suspend", auth: "session" },
  { method: "POST", path: "/admin/extensions/:id/revoke", auth: "session" },

  // Function 10: webhooks
  { method: "POST", path: "/webhooks/telephony", auth: "webhook" },
  { method: "POST", path: "/webhooks/billing", auth: "webhook" },

  // Function 11: billing
  { method: "GET", path: "/billing/plan", auth: "session" },
  { method: "GET", path: "/billing/usage", auth: "session" },
  { method: "POST", path: "/billing/checkout", auth: "session" },
  { method: "POST", path: "/billing/portal", auth: "session" },

  // Function 12: health
  { method: "GET", path: "/health", auth: "public" },
  { method: "GET", path: "/health/dependencies", auth: "session" },
]);

/** Telephony event types accepted by POST /webhooks/telephony. */
export const TELEPHONY_EVENTS = Object.freeze([
  "call.started",
  "call.ringing",
  "call.answered",
  "call.held",
  "call.resumed",
  "call.ended",
  "call.failed",
  "registration.changed",
  "voicemail.deposited",
]);

/** Billing event types accepted by POST /webhooks/billing. */
export const BILLING_EVENTS = Object.freeze([
  "subscription.created",
  "subscription.updated",
  "subscription.cancelled",
  "invoice.paid",
  "invoice.failed",
]);

export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  CSRF_FAILED: "CSRF_FAILED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  REPLAY_DETECTED: "REPLAY_DETECTED",
  DUPLICATE_EVENT: "DUPLICATE_EVENT",
  BILLING_DISABLED: "BILLING_DISABLED",
});

export const STATUS_BY_ERROR = Object.freeze({
  [ERROR_CODES.VALIDATION_ERROR]: 422,
  [ERROR_CODES.UNAUTHENTICATED]: 401,
  [ERROR_CODES.SESSION_EXPIRED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.CSRF_FAILED]: 403,
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 413,
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 405,
  [ERROR_CODES.NOT_IMPLEMENTED]: 501,
  [ERROR_CODES.DEPENDENCY_UNAVAILABLE]: 502,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.INVALID_SIGNATURE]: 401,
  [ERROR_CODES.REPLAY_DETECTED]: 400,
  [ERROR_CODES.DUPLICATE_EVENT]: 202,
  [ERROR_CODES.BILLING_DISABLED]: 503,
});

export function endpointKey(endpoint) {
  return `${endpoint.method} ${API_PREFIX}${endpoint.path}`;
}

export function findEndpoint(method, path) {
  const normalised = path.replace(/\/+$/, "") || "/";
  return ENDPOINTS.find(
    (e) =>
      e.method === method &&
      matchesPath(e.path, normalised)
  );
}

/** Match an API path against a contract template with :params. */
export function matchesPath(template, actual) {
  const t = template.split("/").filter(Boolean);
  const a = actual.split("/").filter(Boolean);
  if (t.length !== a.length) return false;
  return t.every((seg, i) => (seg.startsWith(":") ? a[i].length > 0 : seg === a[i]));
}
