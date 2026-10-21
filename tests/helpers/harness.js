/**
 * Minimal in-process HTTP harness for the CloudTel serverless handlers.
 *
 * The repo intentionally has no test framework beyond `node:test` and no
 * dependency such as supertest. This module provides:
 *
 *   - createRequest(): a Node `IncomingMessage`-shaped object with headers,
 *     method, url, and an async-iterable body.
 *   - createResponse(): a `ServerResponse`-shaped collector that records the
 *     status, headers, and body so assertions can inspect them.
 *   - invoke(app, ...): runs a handler returned by `handler(...)` and returns
 *     `{ status, headers, body, json }`.
 *   - request(app, method, url, { body, headers, cookies }): sugar.
 *
 * Handlers are always wrapped with `handler()` from lib/response.js so that
 * `ctx`, CORS, and the `ApiError -> JSON` envelope are exercised exactly as in
 * production.
 */
import { Readable } from "node:stream";
import { handler } from "../../apps/api/lib/response.js";

export function createRequest({ method = "GET", url = "/", headers = {}, body } = {}) {
  const payload = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const stream = Readable.from(payload ? [Buffer.from(payload)] : []);
  const req = Object.assign(stream, {
    method: method.toUpperCase(),
    url,
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    socket: { remoteAddress: headers["x-forwarded-for"] || "127.0.0.1" },
  });
  return req;
}

export function createResponse() {
  const headers = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name) {
      delete headers[name.toLowerCase()];
    },
    appendHeader(name, value) {
      const key = name.toLowerCase();
      if (headers[key] === undefined) headers[key] = value;
      else if (Array.isArray(headers[key])) headers[key].push(value);
      else headers[key] = [headers[key], value];
      return this;
    },
    getHeaders() {
      return { ...headers };
    },
    writeHead(status, extra) {
      this.statusCode = status;
      if (extra) {
        for (const [k, v] of Object.entries(extra)) headers[k.toLowerCase()] = v;
      }
      return this;
    },
    write(chunk) {
      this.body = (this.body || "") + chunk.toString();
      return true;
    },
    end(chunk) {
      if (chunk !== undefined) this.body = (this.body || "") + chunk.toString();
      this.headersSent = true;
      return this;
    },
    body: "",
  };
  return res;
}

function collectSetCookies(headers) {
  const value = headers["set-cookie"];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Parse the Set-Cookie headers into a `name=value` cookie jar header string. */
export function cookieJar(response) {
  const jar = {};
  for (const raw of collectSetCookies(response.getHeaders())) {
    const [pair] = String(raw).split(";");
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    jar[name] = value;
  }
  return jar;
}

/** Serialise a cookie jar object into a Cookie request header value. */
export function cookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export async function invoke(app, req, res) {
  await app(req, res);
  let json = null;
  if (res.body) {
    try {
      json = JSON.parse(res.body);
    } catch {
      json = null;
    }
  }
  return {
    status: res.statusCode,
    headers: res.getHeaders(),
    body: res.body,
    json,
    cookies: cookieJar(res),
  };
}

/**
 * Build a request runner bound to a handler default-export.
 * `app = createApp(authHandler)` then `await app.request("POST", "/auth/login", {...})`.
 */
export function createApp(defaultExport, { wrap = true } = {}) {
  const app = wrap ? handler(defaultExport) : defaultExport;
  return {
    handler: app,
    async request(method, url, { body, headers = {}, jar } = {}) {
      const finalHeaders = { ...headers };
      if (jar) finalHeaders.cookie = cookieHeader(jar);
      const req = createRequest({ method, url, headers: finalHeaders, body });
      const res = createResponse();
      return invoke(app, req, res);
    },
  };
}
