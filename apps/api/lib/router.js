/**
 * Minimal router used by each serverless function's catch-all handler.
 * Keeps the API at exactly one function per endpoint group (AGENTS.md §2).
 */
import { ApiError, readJsonBody, readRawBody, fail } from "./response.js";
import { authenticate } from "./authentication.js";
import { requirePermission } from "./authorisation.js";
import { consumeRateLimit, rateLimitKey } from "./rate-limit.js";
import { RATE_LIMITS } from "@cloudtel/shared";

/**
 * @typedef {object} Route
 * @property {string} method
 * @property {string} path - e.g. "/users/:id"
 * @property {"public"|"session"|"webhook"} [auth]
 * @property {string} [permission]
 * @property {boolean} [skipCsrf]
 * @property {(ctx: object) => Promise<void>} handle
 */

function matchPath(pattern, actual) {
  const p = pattern.split("/").filter(Boolean);
  const a = actual.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(":")) {
      if (!a[i]) return null;
      params[p[i].slice(1)] = decodeURIComponent(a[i]);
    } else if (p[i] !== a[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Build the default export for a serverless function.
 * @param {Route[]} routes
 */
export function createHandler(routes) {
  return async (req, res, ctx) => {
    const url = new URL(req.url || "/", "http://localhost");
    const basePath = url.pathname.replace(/^\/api\/v1/, "").replace(/\/+$/, "") || "/";
    const method = (req.method || "GET").toUpperCase();

    // Find a matching route (method + path).
    let matched = null;
    let params = null;
    for (const route of routes) {
      if (route.method !== method) continue;
      const result = matchPath(route.path, basePath);
      if (result) {
        matched = route;
        params = result;
        break;
      }
    }

    if (!matched) {
      const pathExists = routes.some((route) => matchPath(route.path, basePath));
      if (pathExists) {
        fail(res, 405, "METHOD_NOT_ALLOWED", `Method ${method} is not supported on this endpoint.`, null, ctx.requestId);
        return;
      }
      fail(res, 404, "NOT_FOUND", "Endpoint not found.", null, ctx.requestId);
      return;
    }

    // Rate limit by route class and caller.
    const authMode = matched.auth || "session";
    let context = { ...ctx, req, res, params, query: Object.fromEntries(url.searchParams) };

    if (authMode === "session") {
      const bucket =
        matched.rateLimit ||
        (method === "GET" ? RATE_LIMITS.READ : RATE_LIMITS.WRITE);
      const limitKey = rateLimitKey([matched.path, ctx.ip, method]);
      const decision = await consumeRateLimit(limitKey, bucket);
      res.setHeader("X-RateLimit-Remaining", String(decision.remaining));
      if (!decision.allowed) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000))));
        fail(res, 429, "RATE_LIMITED", "Too many requests. Please slow down and try again.", null, ctx.requestId);
        return;
      }

      const auth = await authenticate(req, { skipCsrf: Boolean(matched.skipCsrf) });
      context = { ...context, ...auth };
      if (matched.permission) {
        requirePermission(context, matched.permission);
      }
    } else if (authMode === "public") {
      if (method === "POST" || method === "PATCH") {
        context.body = await readJsonBody(req);
      }
    } else if (authMode === "webhook") {
      const rawBody = (await readRawBody(req, { limitBytes: 512 * 1024 })).trim();
      context.rawBody = rawBody;
      try {
        context.body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw new ApiError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
      }
    }

    if (method === "POST" || method === "PATCH" || method === "PUT") {
      if (context.body === undefined) {
        context.body = await readJsonBody(req);
      }
    }

    await matched.handle(context);
  };
}
