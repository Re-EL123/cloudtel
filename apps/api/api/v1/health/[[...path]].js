/**
 * Serverless function 12: Health
 * GET /api/v1/health
 * GET /api/v1/health/dependencies
 *
 * The public endpoint reveals only minimal information. Dependency checks
 * require an authenticated session (§9.2 function 12).
 */
import { success, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { pingDb, query } from "../../../lib/database.js";
import { PERMISSIONS, contextCan } from "../../../lib/authorisation.js";
import { isPbxConfigured } from "../../../lib/pbx-client.js";
import { billingEnabled } from "../../../lib/billing-provider.js";
import { API_FUNCTION_COUNT } from "@cloudtel/shared";

const startedAt = Date.now();

const routes = [
  {
    method: "GET",
    path: "/health",
    auth: "public",
    handle: async (ctx) => {
      success(
        ctx.res,
        {
          status: "ok",
          service: "cloudtel-api",
          version: process.env.APP_VERSION || "1.0.0",
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          serverlessFunctions: API_FUNCTION_COUNT,
          time: new Date().toISOString(),
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/health/dependencies",
    auth: "session",
    handle: async (ctx) => {
      if (!contextCan(ctx, PERMISSIONS.ADMIN_DASHBOARD) && !ctx.isPlatformAdmin) {
        throw new ApiError(403, "FORBIDDEN", "You do not have permission to view system diagnostics.");
      }
      const checks = { database: { ok: false }, pbx: { configured: isPbxConfigured() }, billing: { enabled: billingEnabled() } };
      try {
        const ping = await pingDb();
        checks.database = { ok: true, latencyMs: ping.latencyMs };
        const migrations = await query(`SELECT count(*)::int AS applied FROM schema_migrations`);
        checks.database.migrationsApplied = migrations.rows[0].applied;
      } catch (err) {
        checks.database = { ok: false, error: "Database unreachable." };
        console.error("health:database", { message: err?.message });
      }
      success(ctx.res, checks, { requestId: ctx.requestId });
    },
  },
];

export default createHandler(routes);
