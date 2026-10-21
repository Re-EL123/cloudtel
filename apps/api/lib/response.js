/**
 * HTTP response helpers and the API error type.
 * Every endpoint uses the standard envelope from the specification (§9.1).
 */
import crypto from "node:crypto";

export class ApiError extends Error {
  constructor(status, code, message, fields = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function getRequestId(req) {
  const incoming = req.headers["x-request-id"];
  if (typeof incoming === "string" && incoming.length > 0 && incoming.length <= 128) {
    return incoming;
  }
  return crypto.randomUUID();
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return (req.socket?.remoteAddress || "").slice(0, 64);
}

export function userAgent(req) {
  const value = req.headers["user-agent"];
  return typeof value === "string" ? value.slice(0, 256) : "";
}

export function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.CORS_ORIGINS || process.env.APP_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Always vary on Origin so shared caches never serve the wrong CORS headers.
  res.setHeader("Vary", "Origin");

  // Sessions use cookies, so credentials are always required. Browsers reject
  // "Access-Control-Allow-Origin: *" together with credentials, so we reflect a
  // specific allow-listed origin rather than ever emitting "*".
  const wildcard = allowed.includes("*");
  if (origin && (wildcard || allowed.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-CSRF-Token, X-Request-Id, X-Webhook-Signature, X-Webhook-Timestamp"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "600");
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function success(res, data = null, { status = 200, meta = {}, requestId } = {}) {
  sendJson(res, status, {
    success: true,
    data,
    meta: { requestId: requestId || undefined, ...meta },
  });
}

export function created(res, data, meta = {}) {
  success(res, data, { status: 201, meta });
}

export function accepted(res, data, meta = {}) {
  success(res, data, { status: 202, meta });
}

export function noContent(res) {
  res.statusCode = 204;
  res.end();
}

export function fail(res, status, code, message, fields = null, requestId) {
  sendJson(res, status, {
    success: false,
    error: { code, message, ...(fields ? { fields } : {}) },
    meta: { requestId: requestId || undefined },
  });
}

/** Read the raw request body as text, with a size cap. */
export async function readRawBody(req, { limitBytes = 100 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Read and parse a JSON body with a size cap. */
export async function readJsonBody(req, { limitBytes = 100 * 1024 } = {}) {
  const raw = (await readRawBody(req, { limitBytes })).trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }
}

/**
 * Wrap a request handler with uniform error handling.
 * handler(req, res, ctx) - ctx carries requestId, ip, userAgent.
 */
export function handler(fn) {
  return async (req, res) => {
    const requestId = getRequestId(req);
    const ctx = { requestId, ip: clientIp(req), userAgent: userAgent(req) };
    setCorsHeaders(req, res);
    res.setHeader("X-Request-Id", requestId);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    try {
      await fn(req, res, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        fail(res, err.status, err.code, err.message, err.fields, requestId);
        return;
      }
      console.error("api:error", {
        requestId,
        path: req.url,
        method: req.method,
        message: err?.message,
        stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
      });
      fail(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.", null, requestId);
    }
  };
}
