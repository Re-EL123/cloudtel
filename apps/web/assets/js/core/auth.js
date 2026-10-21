/**
 * Authentication state machine, independent from telephony registration.
 * Holds the decoded session and drives redirects to/from the login screen.
 */
import { api } from "./api-client.js";
import { emit, on } from "./event-bus.js";
import { setState, getState, resetSessionState } from "./state.js";

export const AUTH_STATUS = Object.freeze({
  UNKNOWN: "unknown",
  ANONYMOUS: "anonymous",
  AUTHENTICATED: "authenticated",
});

let status = AUTH_STATUS.UNKNOWN;

export function getAuthStatus() {
  return status;
}

function applySession(session) {
  status = AUTH_STATUS.AUTHENTICATED;
  setState({
    user: session?.user || null,
    membership: session?.membership || null,
    organisationId: session?.membership?.organisationId || session?.organisationId || null,
    permissions: session?.permissions || session?.membership?.permissions || [],
  });
}

export async function login({ email, password, organisationId }) {
  const session = await api.post("/auth/login", { email, password, organisationId }, { auth: false });
  applySession(session);
  emit("auth:logged-in", getState().user);
  return session;
}

export async function logout() {
  try {
    await api.post("/auth/logout", {});
  } catch {
    /* clearing local state is what matters */
  }
  status = AUTH_STATUS.ANONYMOUS;
  resetSessionState();
  emit("auth:logged-out");
}

/**
 * Establish the current session, refreshing it when possible.
 * @returns {Promise<boolean>} true when authenticated
 */
export async function restoreSession() {
  try {
    const session = await api.get("/auth/session");
    applySession(session);
    return true;
  } catch {
    status = AUTH_STATUS.ANONYMOUS;
    return false;
  }
}

/** Refresh rotating session tokens on user activity. */
export async function touchSession() {
  if (status !== AUTH_STATUS.AUTHENTICATED) return;
  try {
    await api.post("/auth/refresh", {});
  } catch {
    /* the next 401 will redirect */
  }
}

export async function requestPasswordReset(email) {
  return api.post("/auth/password/reset-request", { email }, { auth: false });
}

export async function resetPassword({ token, password }) {
  return api.post("/auth/password/reset", { token, password }, { auth: false });
}

export async function changePassword({ currentPassword, newPassword }) {
  return api.post("/auth/password/change", { currentPassword, newPassword });
}

/** Redirect helpers used by the app shell and login page. */
export function requireAuth(redirect = true) {
  if (status === AUTH_STATUS.AUTHENTICATED) return true;
  if (redirect) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login.html?next=${next}`);
  }
  return false;
}

export function redirectIfAuthenticated(target = "/dialer.html") {
  if (status === AUTH_STATUS.AUTHENTICATED) {
    window.location.replace(target);
    return true;
  }
  return false;
}

/** React to a 401 raised by the API client. */
on("auth:unauthorised", () => {
  if (status === AUTH_STATUS.AUTHENTICATED || status === AUTH_STATUS.UNKNOWN) {
    status = AUTH_STATUS.ANONYMOUS;
    resetSessionState();
    emit("auth:expired");
    if (!window.location.pathname.endsWith("/login.html")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login.html?expired=1&next=${next}`);
    }
  }
});

export function hasPermission(permission) {
  const permissions = getState().permissions || [];
  return permissions.includes(permission);
}
