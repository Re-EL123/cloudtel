/**
 * Serverless function 6: Calls and history
 * GET  /api/v1/calls
 * GET  /api/v1/calls/active
 * GET  /api/v1/calls/voicemail
 * GET  /api/v1/calls/stats
 * GET  /api/v1/calls/export
 * GET  /api/v1/calls/:id
 * GET  /api/v1/calls/:id/usage
 * POST /api/v1/calls            (register a browser-originated call)
 * PATCH /api/v1/calls/:id       (update an in-progress/ended call state)
 *
 * History is paginated and organisation-scoped. Users with calls:read_own only
 * see their own records; supervisors and above see the whole organisation.
 */
import {
  CALL_DIRECTIONS,
  CALL_DISPOSITIONS,
  dispositionsInGroup,
  dispositionGroup,
  isValidId,
  parsePagination,
} from "@cloudtel/shared";
import { success, created, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import { PERMISSIONS, contextCan, requireOrganisation } from "../../../lib/authorisation.js";
import { audit } from "../../../lib/audit.js";
import { optionalBoolean, optionalInteger, optionalString } from "../../../lib/validation.js";

function publicCall(row) {
  return {
    id: row.id,
    providerCallId: row.provider_call_id,
    direction: row.direction,
    callerNumber: row.caller_number,
    calleeNumber: row.callee_number,
    callerName: row.caller_name,
    userId: row.user_id,
    userName: row.user_name || null,
    extensionId: row.extension_id,
    extensionNumber: row.extension_number || null,
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    billableSeconds: row.billable_seconds,
    disposition: row.disposition,
    hangupCause: row.hangup_cause,
    source: row.source,
    isActive: !row.ended_at,
  };
}

const SELECT = `
  SELECT c.*, u.name AS user_name, e.number AS extension_number
    FROM call_records c
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN extensions e ON e.id = c.extension_id
`;

/** Build the shared organisation/visibility filter. */
function visibilityFilter(ctx, organisationId, params) {
  const conditions = ["c.organisation_id = $1"];
  params.push(organisationId);
  if (!contextCan(ctx, PERMISSIONS.CALLS_READ_TEAM)) {
    params.push(ctx.user.id);
    conditions.push(`c.user_id = $${params.length}`);
  }
  return conditions;
}

const routes = [
  {
    method: "GET",
    path: "/calls",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { page, pageSize, offset, limit } = parsePagination(ctx.query);
      const params = [];
      const conditions = visibilityFilter(ctx, organisationId, params);

      // Team viewers may further restrict to a specific user.
      const filterUserId = (ctx.query.userId || "").trim();
      if (filterUserId && isValidId(filterUserId) && contextCan(ctx, PERMISSIONS.CALLS_READ_TEAM)) {
        params.push(filterUserId);
        conditions.push(`c.user_id = $${params.length}`);
      }

      const direction = ctx.query.direction;
      if (direction === CALL_DIRECTIONS.INCOMING || direction === CALL_DIRECTIONS.OUTGOING) {
        params.push(direction);
        conditions.push(`c.direction = $${params.length}`);
      }

      const dispositionGroup = (ctx.query.disposition || "").trim();
      if (dispositionGroup) {
        const list = dispositionsInGroup(dispositionGroup);
        if (list.length) {
          params.push(list);
          conditions.push(`c.disposition = ANY($${params.length}::text[])`);
        } else {
          params.push(dispositionGroup);
          conditions.push(`c.disposition = $${params.length}`);
        }
      }

      const from = (ctx.query.from || "").trim();
      if (from && !Number.isNaN(Date.parse(from))) {
        params.push(new Date(from));
        conditions.push(`c.started_at >= $${params.length}`);
      }
      const to = (ctx.query.to || "").trim();
      if (to && !Number.isNaN(Date.parse(to))) {
        params.push(new Date(to));
        conditions.push(`c.started_at <= $${params.length}`);
      }

      const search = (ctx.query.search || "").trim().slice(0, 64);
      if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        conditions.push(
          `(c.caller_number ILIKE $${idx} OR c.callee_number ILIKE $${idx} OR c.caller_name ILIKE $${idx} OR u.name ILIKE $${idx})`
        );
      }

      // Completed history by default; include active rows when requested.
      if (ctx.query.includeActive !== "true") {
        conditions.push(`c.ended_at IS NOT NULL`);
      }

      const where = conditions.join(" AND ");
      params.push(limit, offset);
      const { rows } = await query(
        `${SELECT} WHERE ${where} ORDER BY c.started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const countResult = await query(
        `SELECT count(*)::int AS total FROM call_records c LEFT JOIN users u ON u.id = c.user_id WHERE ${where}`,
        params.slice(0, params.length - 2)
      );
      success(ctx.res, rows.map(publicCall), {
        meta: { page, pageSize, total: countResult.rows[0].total },
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "GET",
    path: "/calls/active",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const params = [];
      const conditions = visibilityFilter(ctx, organisationId, params);
      conditions.push(`c.ended_at IS NULL`);
      const { rows } = await query(
        `${SELECT} WHERE ${conditions.join(" AND ")} ORDER BY c.started_at DESC LIMIT 10`,
        params
      );
      success(ctx.res, rows.map(publicCall), { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/calls/voicemail",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { page, pageSize, offset, limit } = parsePagination(ctx.query);
      const params = [];
      const conditions = visibilityFilter(ctx, organisationId, params);
      conditions.push(`c.disposition = 'voicemail'`);
      const where = conditions.join(" AND ");
      params.push(limit, offset);
      const { rows } = await query(
        `${SELECT} WHERE ${where} ORDER BY c.started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const countResult = await query(
        `SELECT count(*)::int AS total FROM call_records c WHERE ${where}`,
        params.slice(0, params.length - 2)
      );
      success(ctx.res, rows.map(publicCall), {
        meta: { page, pageSize, total: countResult.rows[0].total },
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "GET",
    path: "/calls/stats",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const params = [];
      const conditions = visibilityFilter(ctx, organisationId, params);
      const from = (ctx.query.from || "").trim();
      if (from && !Number.isNaN(Date.parse(from))) {
        params.push(new Date(from));
        conditions.push(`c.started_at >= $${params.length}`);
      } else {
        conditions.push(`c.started_at >= now() - interval '30 days'`);
      }
      const to = (ctx.query.to || "").trim();
      if (to && !Number.isNaN(Date.parse(to))) {
        params.push(new Date(to));
        conditions.push(`c.started_at <= $${params.length}`);
      }
      const where = conditions.join(" AND ");
      const totals = await query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE c.direction = 'incoming')::int AS incoming,
                count(*) FILTER (WHERE c.direction = 'outgoing')::int AS outgoing,
                count(*) FILTER (WHERE c.disposition = 'answered')::int AS answered,
                count(*) FILTER (WHERE c.disposition IN ('missed', 'no_answer'))::int AS missed,
                COALESCE(sum(c.duration_seconds), 0)::int AS talk_seconds,
                COALESCE(sum(c.billable_seconds), 0)::int AS billable_seconds
           FROM call_records c WHERE ${where}`,
        params
      );
      const byDay = await query(
        `SELECT date_trunc('day', c.started_at)::date AS day,
                count(*)::int AS calls,
                count(*) FILTER (WHERE c.disposition = 'answered')::int AS answered,
                COALESCE(sum(c.duration_seconds), 0)::int AS talk_seconds
           FROM call_records c WHERE ${where}
          GROUP BY 1 ORDER BY 1`,
        params
      );
      const byDisposition = await query(
        `SELECT c.disposition, count(*)::int AS calls
           FROM call_records c WHERE ${where}
          GROUP BY 1 ORDER BY calls DESC`,
        params
      );
      const t = totals.rows[0];
      success(
        ctx.res,
        {
          total: t.total,
          incoming: t.incoming,
          outgoing: t.outgoing,
          answered: t.answered,
          missed: t.missed,
          talkSeconds: t.talk_seconds,
          billableSeconds: t.billable_seconds,
          answerRate: t.total ? Number((t.answered / t.total).toFixed(4)) : 0,
          daily: byDay.rows.map((r) => ({
            day: r.day,
            calls: r.calls,
            answered: r.answered,
            talkSeconds: r.talk_seconds,
          })),
          byDisposition: byDisposition.rows.map((r) => ({
            disposition: r.disposition,
            group: dispositionGroup(r.disposition),
            calls: r.calls,
          })),
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/calls/export",
    auth: "session",
    permission: PERMISSIONS.CALLS_EXPORT,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const params = [];
      const conditions = visibilityFilter(ctx, organisationId, params);
      const from = (ctx.query.from || "").trim();
      if (from && !Number.isNaN(Date.parse(from))) {
        params.push(new Date(from));
        conditions.push(`c.started_at >= $${params.length}`);
      }
      const to = (ctx.query.to || "").trim();
      if (to && !Number.isNaN(Date.parse(to))) {
        params.push(new Date(to));
        conditions.push(`c.started_at <= $${params.length}`);
      }
      conditions.push(`c.ended_at IS NOT NULL`);
      const { rows } = await query(
        `${SELECT} WHERE ${conditions.join(" AND ")} ORDER BY c.started_at DESC LIMIT 10000`,
        params
      );
      const header = [
        "started_at",
        "direction",
        "caller_number",
        "callee_number",
        "user",
        "extension",
        "duration_seconds",
        "billable_seconds",
        "disposition",
      ];
      const escapeCsv = (value) => {
        const text = value == null ? "" : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.started_at?.toISOString?.() || r.started_at,
            r.direction,
            r.caller_number,
            r.callee_number,
            r.user_name || "",
            r.extension_number || "",
            r.duration_seconds,
            r.billable_seconds,
            r.disposition,
          ]
            .map(escapeCsv)
            .join(",")
        );
      }
      const csv = lines.join("\n");
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "calls.export",
        resourceType: "call_record",
        metadata: { rows: rows.length },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      ctx.res.statusCode = 200;
      ctx.res.setHeader("Content-Type", "text/csv; charset=utf-8");
      ctx.res.setHeader("Content-Disposition", `attachment; filename="cloudtel-calls.csv"`);
      ctx.res.end(csv);
    },
  },

  {
    method: "GET",
    path: "/calls/:id",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      if (!isValidId(ctx.params.id)) throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      const { rows } = await query(`${SELECT} WHERE c.organisation_id = $1 AND c.id = $2`, [
        organisationId,
        ctx.params.id,
      ]);
      const row = rows[0];
      if (!row) throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      if (!contextCan(ctx, PERMISSIONS.CALLS_READ_TEAM) && row.user_id !== ctx.user.id) {
        throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      }

      const events = await query(
        `SELECT event_type, occurred_at, payload FROM call_events
          WHERE organisation_id = $1 AND (call_record_id = $2 OR provider_call_id = $3)
          ORDER BY occurred_at`,
        [organisationId, row.id, row.provider_call_id || ""]
      );

      success(ctx.res, { ...publicCall(row), events: events.rows }, { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/calls/:id/usage",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      if (!isValidId(ctx.params.id)) throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      const { rows } = await query(`SELECT * FROM call_records WHERE organisation_id = $1 AND id = $2`, [
        organisationId,
        ctx.params.id,
      ]);
      const row = rows[0];
      if (!row) throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      if (!contextCan(ctx, PERMISSIONS.CALLS_READ_TEAM) && row.user_id !== ctx.user.id) {
        throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      }

      const usage = await query(
        `SELECT metric, quantity, unit, occurred_at FROM usage_records
          WHERE organisation_id = $1 AND call_record_id = $2
          ORDER BY metric`,
        [organisationId, row.id]
      );
      success(
        ctx.res,
        {
          callId: row.id,
          durationSeconds: row.duration_seconds,
          billableSeconds: row.billable_seconds,
          // Billable duration comes from the PBX/provider, never the browser timer.
          records: usage.rows.map((r) => ({
            metric: r.metric,
            quantity: Number(r.quantity),
            unit: r.unit,
            occurredAt: r.occurred_at,
          })),
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "POST",
    path: "/calls",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const direction = optionalString(ctx.body, "direction", { max: 20 }) || CALL_DIRECTIONS.OUTGOING;
      if (direction !== CALL_DIRECTIONS.INCOMING && direction !== CALL_DIRECTIONS.OUTGOING) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          direction: "Direction must be incoming or outgoing.",
        });
      }
      const calleeNumber =
        optionalString(ctx.body, "calleeNumber", { max: 32, allowEmpty: true }) ||
        optionalString(ctx.body, "remoteNumber", { max: 32, allowEmpty: true }) ||
        "";
      const callerNumber = optionalString(ctx.body, "callerNumber", { max: 32, allowEmpty: true }) || "";
      const callerName =
        optionalString(ctx.body, "callerName", { max: 120, allowEmpty: true }) ||
        optionalString(ctx.body, "displayName", { max: 120, allowEmpty: true }) ||
        "";
      const providerCallId = optionalString(ctx.body, "providerCallId", { max: 120, allowEmpty: true }) || null;
      const extensionId = optionalString(ctx.body, "extensionId", { max: 64, allowEmpty: true }) || null;
      const disposition = optionalString(ctx.body, "disposition", { max: 20, allowEmpty: false });
      const startedAt = optionalString(ctx.body, "startedAt", { max: 40, allowEmpty: false });
      if (disposition && !Object.values(CALL_DISPOSITIONS).includes(disposition)) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          disposition: "Unknown disposition.",
        });
      }

      if (!calleeNumber && !callerNumber) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          calleeNumber: "A dialled or calling number is required.",
        });
      }

      if (providerCallId) {
        const existing = await query(
          `SELECT * FROM call_records WHERE organisation_id = $1 AND provider_call_id = $2`,
          [organisationId, providerCallId]
        );
        if (existing.rows[0]) {
          success(ctx.res, publicCall(existing.rows[0]), { requestId: ctx.requestId });
          return;
        }
      }

      const startedAtValue = startedAt && !Number.isNaN(Date.parse(startedAt)) ? new Date(startedAt) : new Date();
      const { rows } = await query(
        `INSERT INTO call_records
           (organisation_id, user_id, extension_id, provider_call_id, direction, caller_number,
            callee_number, caller_name, started_at, disposition, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'browser')
         RETURNING *`,
        [
          organisationId,
          ctx.user.id,
          extensionId,
          providerCallId,
          direction,
          callerNumber,
          calleeNumber,
          callerName,
          startedAtValue,
          disposition || CALL_DISPOSITIONS.CANCELLED,
        ]
      );
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "call.start",
        resourceType: "call_record",
        resourceId: rows[0].id,
        metadata: { direction, calleeNumber, providerCallId },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      created(ctx.res, publicCall(rows[0]), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/calls/:id",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      if (!isValidId(ctx.params.id)) throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      const { rows } = await query(`SELECT * FROM call_records WHERE organisation_id = $1 AND id = $2`, [
        organisationId,
        ctx.params.id,
      ]);
      const call = rows[0];
      if (!call) throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      // Only the call owner (or a team viewer) may update a record.
      if (call.user_id !== ctx.user.id && !contextCan(ctx, PERMISSIONS.CALLS_READ_TEAM)) {
        throw new ApiError(404, "NOT_FOUND", "Call record not found.");
      }

      const answered = optionalBoolean(ctx.body, "answered");
      const ended = optionalBoolean(ctx.body, "ended");
      const answeredAt = optionalString(ctx.body, "answeredAt", { max: 40, allowEmpty: false });
      const endedAt = optionalString(ctx.body, "endedAt", { max: 40, allowEmpty: false });
      const dispositionInput = optionalString(ctx.body, "disposition", { max: 20, allowEmpty: false });
      const hangupCause = optionalString(ctx.body, "hangupCause", { max: 80, allowEmpty: true });
      const billableSeconds = optionalInteger(ctx.body, "billableSeconds", { min: 0, max: 86400 });
      const durationSeconds = optionalInteger(ctx.body, "durationSeconds", { min: 0, max: 86400 });

      const updates = [];
      const params = [call.id];
      let answeredAtValue = null;
      if (answeredAt && !Number.isNaN(Date.parse(answeredAt))) answeredAtValue = new Date(answeredAt);
      if (answeredAtValue) {
        params.push(answeredAtValue);
        updates.push(`answered_at = $${params.length}`);
      } else if (answered === true && !call.answered_at) {
        updates.push(`answered_at = COALESCE(answered_at, now())`);
      }
      let endedAtValue = null;
      if (endedAt && !Number.isNaN(Date.parse(endedAt))) endedAtValue = new Date(endedAt);
      if (endedAtValue) {
        params.push(endedAtValue);
        updates.push(`ended_at = $${params.length}`);
      } else if (ended === true && !call.ended_at) {
        updates.push(`ended_at = COALESCE(ended_at, now())`);
      }
      if (hangupCause !== undefined) {
        params.push(hangupCause || null);
        updates.push(`hangup_cause = $${params.length}`);
      }
      if (billableSeconds !== undefined) {
        params.push(billableSeconds);
        updates.push(`billable_seconds = $${params.length}`);
      }
      const disposition = dispositionInput;
      if (disposition && !Object.values(CALL_DISPOSITIONS).includes(disposition)) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          disposition: "Unknown disposition.",
        });
      }
      if (disposition) {
        params.push(disposition);
        updates.push(`disposition = $${params.length}`);
      }

      // Recompute duration when the call has ended (unless explicitly supplied).
      const willEnd = Boolean(endedAtValue) || ended === true || Boolean(call.ended_at);
      if (durationSeconds !== undefined) {
        params.push(durationSeconds);
        updates.push(`duration_seconds = $${params.length}`);
      } else if (willEnd) {
        updates.push(
          `duration_seconds = GREATEST(0, floor(extract(epoch FROM (COALESCE(ended_at, now()) - started_at)))::int)`
        );
      }
      if (!disposition && willEnd) {
        updates.push(`disposition = CASE WHEN answered_at IS NOT NULL THEN 'answered' ELSE 'cancelled' END`);
      }

      if (!updates.length) throw new ApiError(422, "VALIDATION_ERROR", "No updatable fields were supplied.");
      updates.push("updated_at = now()");
      const { rows: updated } = await query(
        `UPDATE call_records SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        params
      );

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "call.update",
        resourceType: "call_record",
        resourceId: call.id,
        metadata: { fields: Object.keys(ctx.body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, publicCall(updated[0]), { requestId: ctx.requestId });
    },
  },
];

export default createHandler(routes);
