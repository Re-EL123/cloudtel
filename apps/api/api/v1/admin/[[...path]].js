/**
 * Serverless function 9: Administration
 * GET  /api/v1/admin/dashboard
 * GET  /api/v1/admin/audit-logs
 * GET  /api/v1/admin/usage
 * POST /api/v1/admin/users/:id/suspend
 * POST /api/v1/admin/extensions/:id/revoke
 *
 * Every administrative action is authorised and audited (§9.2 function 9).
 */
import { isValidId, parsePagination } from "@cloudtel/shared";
import { success, ApiError, handler } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import { PERMISSIONS, getMembership, requireOrganisation } from "../../../lib/authorisation.js";
import { revokeAllUserSessions } from "../../../lib/authentication.js";
import { audit } from "../../../lib/audit.js";
import { deleteExtensionOnPbx, isPbxConfigured } from "../../../lib/pbx-client.js";

const routes = [
  {
    method: "GET",
    path: "/admin/dashboard",
    auth: "session",
    permission: PERMISSIONS.ADMIN_DASHBOARD,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const [members, extensions, callsToday, callsMonth, missedToday, minutesMonth] = await Promise.all([
        query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE m.status = 'active')::int AS active
             FROM organisation_members m WHERE m.organisation_id = $1`,
          [organisationId]
        ),
        query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status = 'active')::int AS active,
                  count(*) FILTER (WHERE provisioning_status = 'ready')::int AS ready,
                  count(*) FILTER (WHERE provisioning_status IN ('pending', 'provisioning', 'failed'))::int AS pending
             FROM extensions WHERE organisation_id = $1`,
          [organisationId]
        ),
        query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE disposition = 'missed')::int AS missed
             FROM call_records
            WHERE organisation_id = $1 AND started_at >= date_trunc('day', now())`,
          [organisationId]
        ),
        query(
          `SELECT count(*)::int AS total
             FROM call_records
            WHERE organisation_id = $1 AND started_at >= date_trunc('month', now())`,
          [organisationId]
        ),
        query(
          `SELECT count(*)::int AS total
             FROM call_records
            WHERE organisation_id = $1 AND disposition = 'missed' AND started_at >= date_trunc('day', now())`,
          [organisationId]
        ),
        query(
          `SELECT COALESCE(sum(duration_seconds), 0)::int AS total
             FROM call_records
            WHERE organisation_id = $1 AND started_at >= date_trunc('month', now())`,
          [organisationId]
        ),
      ]);

      const recentAudit = await query(
        `SELECT action, resource_type, resource_id, created_at
           FROM audit_logs WHERE organisation_id = $1
          ORDER BY created_at DESC LIMIT 10`,
        [organisationId]
      );

      success(
        ctx.res,
        {
          members: members.rows[0],
          extensions: extensions.rows[0],
          callsToday: callsToday.rows[0],
          callsThisMonth: callsMonth.rows[0],
          missedToday: missedToday.rows[0].total,
          minutesThisMonth: Math.round((minutesMonth.rows[0].total || 0) / 60),
          recentActivity: recentAudit.rows.map((r) => ({
            action: r.action,
            resourceType: r.resource_type,
            resourceId: r.resource_id,
            createdAt: r.created_at,
          })),
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/admin/audit-logs",
    auth: "session",
    permission: PERMISSIONS.ADMIN_AUDIT,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { page, pageSize, offset, limit } = parsePagination(ctx.query);
      const params = [organisationId];
      const conditions = ["organisation_id = $1"];

      const action = (ctx.query.action || "").trim();
      if (action) {
        params.push(action);
        conditions.push(`action = $${params.length}`);
      }
      const from = (ctx.query.from || "").trim();
      if (from && !Number.isNaN(Date.parse(from))) {
        params.push(new Date(from));
        conditions.push(`created_at >= $${params.length}`);
      }
      const to = (ctx.query.to || "").trim();
      if (to && !Number.isNaN(Date.parse(to))) {
        params.push(new Date(to));
        conditions.push(`created_at <= $${params.length}`);
      }

      const where = conditions.join(" AND ");
      params.push(limit, offset);
      const { rows } = await query(
        `SELECT a.*, u.name AS user_name, u.email AS user_email
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE ${where}
          ORDER BY a.created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const countResult = await query(`SELECT count(*)::int AS total FROM audit_logs WHERE ${where}`, params.slice(0, -2));
      success(
        ctx.res,
        rows.map((r) => ({
          id: r.id,
          action: r.action,
          userId: r.user_id,
          userName: r.user_name,
          userEmail: r.user_email,
          resourceType: r.resource_type,
          resourceId: r.resource_id,
          metadata: r.metadata,
          ip: r.ip,
          requestId: r.request_id,
          createdAt: r.created_at,
        })),
        { meta: { page, pageSize, total: countResult.rows[0].total }, requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/admin/usage",
    auth: "session",
    permission: PERMISSIONS.ADMIN_USAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const days = Math.min(Math.max(Number.parseInt(ctx.query.days, 10) || 30, 1), 90);
      const daily = await query(
        `SELECT date_trunc('day', occurred_at)::date AS day,
                sum(quantity) FILTER (WHERE metric = 'billable_seconds') AS billable_seconds,
                sum(quantity) FILTER (WHERE metric = 'call_seconds') AS call_seconds,
                sum(quantity) FILTER (WHERE metric = 'calls_count') AS calls
           FROM usage_records
          WHERE organisation_id = $1 AND occurred_at >= now() - ($2 || ' days')::interval
          GROUP BY 1
          ORDER BY 1`,
        [organisationId, String(days)]
      );
      const byUser = await query(
        `SELECT u.id, u.name, u.email,
                sum(r.duration_seconds) AS duration_seconds,
                count(*) AS calls
           FROM call_records r
           JOIN users u ON u.id = r.user_id
          WHERE r.organisation_id = $1 AND r.started_at >= now() - ($2 || ' days')::interval
          GROUP BY u.id, u.name, u.email
          ORDER BY duration_seconds DESC
          LIMIT 50`,
        [organisationId, String(days)]
      );
      success(
        ctx.res,
        {
          periodDays: days,
          daily: daily.rows.map((r) => ({
            day: r.day,
            billableSeconds: Number(r.billable_seconds || 0),
            callSeconds: Number(r.call_seconds || 0),
            calls: Number(r.calls || 0),
          })),
          byUser: byUser.rows.map((r) => ({
            userId: r.id,
            name: r.name,
            email: r.email,
            durationSeconds: Number(r.duration_seconds || 0),
            calls: Number(r.calls || 0),
          })),
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "POST",
    path: "/admin/users/:id/suspend",
    auth: "session",
    permission: PERMISSIONS.USERS_SUSPEND,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const targetId = ctx.params.id;
      if (!isValidId(targetId)) throw new ApiError(404, "NOT_FOUND", "User not found.");
      if (targetId === ctx.user.id) {
        throw new ApiError(409, "CONFLICT", "You cannot suspend your own account.");
      }
      const membership = await getMembership(targetId, organisationId);
      if (!membership) throw new ApiError(404, "NOT_FOUND", "User not found in this organisation.");
      if (membership.role === "owner") {
        throw new ApiError(409, "CONFLICT", "The organisation owner cannot be suspended.");
      }

      await query(`UPDATE organisation_members SET status = 'suspended', updated_at = now() WHERE id = $1`, [
        membership.id,
      ]);
      await query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`, [targetId]);
      await revokeAllUserSessions(targetId);

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "admin.user_suspend",
        resourceType: "user",
        resourceId: targetId,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { suspended: true, userId: targetId }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/admin/extensions/:id/revoke",
    auth: "session",
    permission: PERMISSIONS.EXTENSIONS_REVOKE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      if (!isValidId(ctx.params.id)) throw new ApiError(404, "NOT_FOUND", "Extension not found.");
      const { rows } = await query(`SELECT * FROM extensions WHERE organisation_id = $1 AND id = $2`, [
        organisationId,
        ctx.params.id,
      ]);
      const extension = rows[0];
      if (!extension) throw new ApiError(404, "NOT_FOUND", "Extension not found.");

      if (isPbxConfigured() && extension.pbx_endpoint_id) {
        await deleteExtensionOnPbx(extension);
      }
      await query(
        `UPDATE extensions
            SET status = 'revoked', provisioning_status = 'disabled', user_id = NULL, updated_at = now()
          WHERE id = $1`,
        [extension.id]
      );
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "admin.extension_revoke",
        resourceType: "extension",
        resourceId: extension.id,
        metadata: { number: extension.number },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { revoked: true, extensionId: extension.id }, { requestId: ctx.requestId });
    },
  },
];

export default handler(createHandler(routes));
