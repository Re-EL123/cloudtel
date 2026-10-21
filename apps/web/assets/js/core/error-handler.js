/**
 * Central error handling: turns thrown values into toasts, logs them, and
 * keeps the UI from crashing on an unexpected failure.
 */
import { notifyError } from "../ui/notifications.js";
import { ApiClientError } from "./api-client.js";

const FRIENDLY_CODES = {
  NETWORK_ERROR: "Check your internet connection and try again.",
  UNAUTHENTICATED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "You do not have permission to do that.",
  NOT_FOUND: "That item could not be found.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  VALIDATION_ERROR: "Please correct the highlighted fields.",
};

export function describeError(error) {
  if (error instanceof ApiClientError) {
    return {
      title: error.status === 0 ? "Connection problem" : "Request failed",
      message: FRIENDLY_CODES[error.code] || error.message || "Something went wrong.",
      fields: error.fields || null,
      code: error.code,
      status: error.status,
    };
  }
  return {
    title: "Something went wrong",
    message: error?.message || "An unexpected error occurred.",
    fields: null,
    code: "UNKNOWN",
    status: 0,
  };
}

/** Report an error to the user and the console. */
export function handleError(error, { silent = false } = {}) {
  const info = describeError(error);
  console.error(`[cloudtel] ${info.title}: ${info.message}`, error);
  if (!silent) notifyError(info.message, info.title);
  return info;
}

/** Wrap an async handler so rejections never escape to the console unhandled. */
export function guard(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      handleError(error);
      return null;
    }
  };
}

/** Apply server field errors to a createField() instance map. */
export function applyFieldErrors(fields, fieldMap = {}) {
  if (!fields) return;
  for (const [name, message] of Object.entries(fields)) {
    fieldMap[name]?.setError?.(message);
  }
}

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof ApiClientError) {
    handleError(event.reason);
    event.preventDefault();
  }
});
