/**
 * Authenticated test client.
 *
 * `login()` performs a real login through the auth handler and returns a
 * credential object (session + CSRF cookies). Because every serverless function
 * is a separate handler, the credentials are decoupled from the handler:
 * call `request(handler, method, url, options)` and the helper attaches the
 * cookies and the CSRF header on state-changing methods.
 */
import { handler } from "../../apps/api/lib/response.js";
import { createRequest, createResponse, invoke, cookieHeader } from "./harness.js";

/** Wrap a handler default export so it runs with ctx + the JSON envelope. */
export function app(defaultExport) {
  const wrapped = handler(defaultExport);
  return {
    send(method, url, { body, headers = {}, jar } = {}) {
      const finalHeaders = { ...headers };
      if (jar) finalHeaders.cookie = cookieHeader(jar);
      return invoke(wrapped, createRequest({ method, url, headers: finalHeaders, body }), createResponse());
    },
  };
}

/**
 * Execute one request against a specific handler, optionally authenticated.
 * `client` is the object returned by `login()` (or null for anonymous).
 */
export function request(target, method, url, { body, headers = {}, client, csrf = true, ip = "10.0.0.1" } = {}) {
  const finalHeaders = { "x-forwarded-for": ip, ...headers };
  if (client) {
    if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
      finalHeaders["x-csrf-token"] = client.csrfToken;
    }
  }
  const instance = typeof target === "function" ? app(target) : target;
  return instance.send(method, url, { body, headers: finalHeaders, jar: client?.jar });
}

/** Log in and return credentials (jar + csrfToken) plus a bound request helper. */
export async function login(authExport, { email, password, organisationId, ip = "10.0.0.1" } = {}) {
  const auth = app(authExport);
  const res = await auth.send("POST", "/api/v1/auth/login", {
    body: { email, password, organisationId },
    headers: { "x-forwarded-for": ip },
  });

  if (res.status !== 200) {
    throw new Error(`login failed (${res.status}): ${res.body}`);
  }

  const jar = { ...res.cookies };
  const csrfToken = res.json?.data?.csrfToken || jar.cloudtel_csrf;

  const client = {
    jar,
    csrfToken,
    data: res.json.data,
    ip,
    request(target, method, url, options = {}) {
      return request(target, method, url, { client, ip, ...options });
    },
  };
  return client;
}

/** Anonymous request helper bound to a fixed ip. */
export function anonymous(target, ip = "10.0.0.1") {
  return {
    request(method, url, options = {}) {
      return request(target, method, url, { ip, ...options });
    },
  };
}
