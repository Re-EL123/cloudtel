/**
 * The single HTTP gateway for the browser. Every feature calls this module;
 * nothing else in apps/web is allowed to use fetch() (AGENTS.md §3).
 *
 * Responsibilities: URL building, credentials, CSRF double-submit, envelope
 * unwrapping, error normalisation and 401 handling.
 */
import { getApiBase, initConfig } from "./config.js";
import { emit } from "./event-bus.js";

export class ApiClientError extends Error {
  constructor(message, { status = 0, code = "ERROR", fields = null, requestId = null } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

/**
 * CSRF token storage. For a same-origin API the token is mirrored into the
 * readable `cloudtel_csrf` cookie. For a cross-origin API the cookie belongs to
 * the API origin and is invisible to this document, so we also remember the
 * token returned in the JSON body of session responses.
 */
let csrfTokenFromBody = null;

/** Read the readable CSRF cookie set alongside the session cookie. */
function readCsrfCookie() {
  const match = document.cookie.match(/(?:^|;\s*)cloudtel_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Prefer the cookie (same-origin), fall back to the body-delivered token (cross-origin). */
function readCsrfToken() {
  return readCsrfCookie() || csrfTokenFromBody;
}

/** Remember a token returned in a response body so later writes can echo it. */
export function setCsrfToken(token) {
  csrfTokenFromBody = token || null;
}

function buildUrl(path, query) {
  const base = path.startsWith("/") ? path : `/${path}`;
  // The API base may be same-origin ("/api/v1") or an absolute cross-origin URL.
  const url = new URL(`${getApiBase()}${base}`, document.baseURI);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
      else url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * @param {string} path
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.query]
 * @param {object|FormData} [options.body]
 * @param {boolean} [options.auth] - send cookies (default true)
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<any>} the `data` payload from the response envelope
 */
export async function request(path, options = {}) {
  const {
    method = "GET",
    query = null,
    body = null,
    auth = true,
    signal,
    raw = false,
  } = options;

  const headers = { Accept: "application/json" };
  const isForm = body instanceof FormData;
  const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());

  // Ensure runtime config (API base URL) is loaded before the first request.
  // Memoised, so this is a no-op after boot.
  await initConfig();

  if (body !== null && !isForm) headers["Content-Type"] = "application/json";
  if (auth && isStateChanging) {
    const csrf = readCsrfToken();
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  let response;
  try {
    // Cookies (session + CSRF) must be sent on every API call. "include" is
    // required when the API is hosted on a different origin (GitHub Pages);
    // for a same-origin API it behaves identically to "same-origin" for GETs
    // and is required for cross-origin credentialed requests.
    const credentials = auth ? "include" : "omit";
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials,
      body: body === null ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    emit("api:offline");
    throw new ApiClientError("Unable to reach the CloudTel service. Check your connection.", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  if (response.status === 204) return null;

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (response.status === 401) {
    emit("auth:unauthorised");
  }

  // Capture a rotated/issued CSRF token from the envelope (cross-origin support).
  if (payload?.data?.csrfToken) setCsrfToken(payload.data.csrfToken);

  if (!response.ok || (payload && payload.success === false)) {
    const error = payload?.error || {};
    throw new ApiClientError(error.message || `Request failed (${response.status}).`, {
      status: response.status,
      code: error.code || "HTTP_ERROR",
      fields: error.fields || null,
      requestId: payload?.meta?.requestId || null,
    });
  }

  if (raw) return payload;
  return payload?.data ?? null;
}

export const api = {
  get: (path, query, options) => request(path, { ...options, method: "GET", query }),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  delete: (path, body, options) => request(path, { ...options, method: "DELETE", body }),
};
