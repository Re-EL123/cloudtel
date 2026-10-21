/**
 * Serverless function 4: Extensions
 * GET   /api/v1/extensions
 * GET   /api/v1/extensions/me
 * GET   /api/v1/extensions/:id/telephony
 * POST  /api/v1/extensions
 * PATCH /api/v1/extensions/:id
 * POST  /api/v1/extensions/:id/rotate
 * POST  /api/v1/extensions/:id/disable
 * POST  /api/v1/extensions/:id/enable
 * DELETE /api/v1/extensions/:id
 *
 * A database row alone is never treated as proof that the PBX endpoint exists
 * (§12.2). Provisioning status is tracked explicitly and failures surface to
 * the administrator.
 */
import { PROVISIONING_STATES, EXTENSION_STATUSES } from "@cloudtel/shared";
import { isValidId, validateExtensionNumber, validateName, parsePagination } from "@cloudtel/shared";
import { success, created, accepted, noContent, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import { PERMISSIONS, requireOrganisation, contextCan } from "../../../lib/authorisation.js";
import { audit } from "../../../lib/audit.js";
import { optionalBoolean, optionalInteger, optionalString, requireString } from "../../../lib/validation.js";
import {
  provisionExtension,
  updateExtensionOnPbx,
  deleteExtensionOnPbx,
  isPbxConfigured,
  publicTelephonyConfig,
} from "../../../lib/pbx-client.js";

function publicExtension(row) {
  return {
    id: row.id,
    number: row.number,
    displayName: row.display_name,
    userId: row.user_id,
    userName: row.user_name || null,
    status: row.status,
    provisioningStatus: row.provisioning_status,
    provisioningError: row.provisioning_error || null,
    provisionedAt: row.provisioned_at || null,
    context: row.context,
    maxConcurrentCalls: row.max_concurrent_calls,
    allowExternal: row.allow_external,
    createdAt: row.created_at,
  };
}

const SELECT_SQL = `
  SELECT e.*, u.name AS user_name
    FROM extensions e
    LEFT JOIN users u ON u.id = e.user_id
   WHERE e.organisation_id = $1
`;

/** Public telephony identifiers only - never SIP passwords or PBX secrets. */
function publicExtensionTelephony(row) {
  return {
    extensionId: row.id,
    number: row.number,
    displayName: row.display_name,
    status: row.status,
    provisioningStatus: row.provisioning_status,
    context: row.context,
    maxConcurrentCalls: row.max_concurrent_calls,
    allowExternal: row.allow_external,
    pbxEndpointConfigured: Boolean(row.pbx_endpoint_id),
    sip: publicTelephonyConfig(),
  };
}

async function loadExtension(organisationId, id) {
  if (!isValidId(id)) throw new ApiError(404, "NOT_FOUND", "Extension not found.");
  const { rows } = await query(`${SELECT_SQL} AND e.id = $2`, [organisationId, id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Extension not found.");
  return rows[0];
}

/** Provisioning step 4-7 of §12.2: call the PBX, verify, persist, audit. */
async function runProvisioning(extension, context, { mode = "create" } = {}) {
  const mark = async (status, extra = {}) => {
    await query(
      `UPDATE extensions
          SET provisioning_status = $2,
              provisioning_error = $3,
              provisioned_at = CASE WHEN $2 = 'ready' THEN now() ELSE provisioned_at END,
              status = COALESCE($4, status),
              updated_at = now()
        WHERE id = $1`,
      [extension.id, status, extra.error || null, extra.status || null]
    );
  };

  if (!isPbxConfigured()) {
    await mark(PROVISIONING_STATES.FAILED, {
      error: "PBX integration is not configured. Set PBX_API_BASE_URL and retry provisioning.",
    });
    await audit({
      organisationId: extension.organisation_id,
      userId: context.user.id,
      action: "extension.provisioning_failed",
      resourceType: "extension",
      resourceId: extension.id,
      metadata: { reason: "pbx_not_configured", mode },
      ip: context.ip,
      requestId: context.requestId,
    });
    return { provisioningStatus: PROVISIONING_STATES.FAILED, error: "PBX integration is not configured." };
  }

  await mark(PROVISIONING_STATES.PROVISIONING);
  const result = mode === "create" ? await provisionExtension(extension) : await updateExtensionOnPbx(extension);
  if (result.ok) {
    await query(`UPDATE extensions SET pbx_endpoint_id = COALESCE(pbx_endpoint_id, $2) WHERE id = $1`, [
      extension.id,
      result.endpointId,
    ]);
    await mark(PROVISIONING_STATES.READY, { status: EXTENSION_STATUSES.ACTIVE });
    await audit({
      organisationId: extension.organisation_id,
      userId: context.user.id,
      action: "extension.provisioned",
      resourceType: "extension",
      resourceId: extension.id,
      metadata: { number: extension.number, mode },
      ip: context.ip,
      requestId: context.requestId,
    });
    return { provisioningStatus: PROVISIONING_STATES.READY };
  }

  await mark(PROVISIONING_STATES.FAILED, { error: result.error });
  await audit({
    organisationId: extension.organisation_id,
    userId: context.user.id,
    action: "extension.provisioning_failed",
    resourceType: "extension",
    resourceId: extension.id,
    metadata: { reason: result.error, mode },
    ip: context.ip,
    requestId: context.requestId,
  });
  return { provisioningStatus: PROVISIONING_STATES.FAILED, error: result.error };
}

const routes = [
  {
    method: "GET",
    path: "/extensions",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      // Directory-wide read needs extensions:read; otherwise users see only theirs.
      const includeAll = contextCan(ctx, PERMISSIONS.EXTENSIONS_READ);
      const { page, pageSize, offset, limit } = parsePagination(ctx.query);
      const params = [organisationId];
      let where = "";
      if (!includeAll) {
        params.push(ctx.user.id);
        where = ` AND e.user_id = $2`;
      }
      params.push(limit, offset);
      const { rows } = await query(
        `${SELECT_SQL}${where} ORDER BY e.number LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const countResult = await query(
        `SELECT count(*)::int AS total FROM extensions e WHERE e.organisation_id = $1${where.replace(/\$\d+/g, "$2")}`,
        includeAll ? [organisationId] : [organisationId, ctx.user.id]
      );
      success(ctx.res, rows.map(publicExtension), {
        meta: { page, pageSize, total: countResult.rows[0].total },
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "GET",
    path: "/extensions/me",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(`${SELECT_SQL} AND e.user_id = $2 AND e.status = 'active' ORDER BY e.number`, [
        organisationId,
        ctx.user.id,
      ]);
      success(ctx.res, rows.map(publicExtension), { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/extensions/:id/telephony",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const extension = await loadExtension(organisationId, ctx.params.id);
      // Owners may read their own extension; administrators may read any.
      const isOwner = extension.user_id === ctx.user.id;
      if (!isOwner && !contextCan(ctx, PERMISSIONS.EXTENSIONS_READ)) {
        throw new ApiError(404, "NOT_FOUND", "Extension not found.");
      }
      success(ctx.res, publicExtensionTelephony(extension), { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/extensions",
    auth: "session",
    permission: PERMISSIONS.EXTENSIONS_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const number = requireString(ctx.body, "number", { max: 12 });
      const numberCheck = validateExtensionNumber(number);
      if (!numberCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          number: numberCheck.message,
        });
      }
      const displayName = optionalString(ctx.body, "displayName", { max: 120 }) || number;
      const nameCheck = validateName(displayName, { field: "Display name", required: false, max: 120 });
      if (!nameCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          displayName: nameCheck.message,
        });
      }
      const userId = optionalString(ctx.body, "userId", { max: 64, allowEmpty: true }) || null;
      const maxConcurrentCalls = optionalInteger(ctx.body, "maxConcurrentCalls", { min: 1, max: 20, fallback: 2 });
      const allowExternal = optionalBoolean(ctx.body, "allowExternal", false);

      if (userId) {
        const member = await query(
          `SELECT id FROM organisation_members WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
          [organisationId, userId]
        );
        if (!member.rows[0]) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
            userId: "That user is not an active member of this organisation.",
          });
        }
      }

      const clash = await query(
        `SELECT id FROM extensions WHERE organisation_id = $1 AND number = $2 AND status <> 'revoked'`,
        [organisationId, number]
      );
      if (clash.rows[0]) {
        throw new ApiError(409, "CONFLICT", "That extension number is already in use.");
      }

      const { rows } = await query(
        `INSERT INTO extensions (organisation_id, user_id, number, display_name, max_concurrent_calls, allow_external, created_by, provisioning_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING *`,
        [organisationId, userId, number, displayName, maxConcurrentCalls, allowExternal, ctx.user.id]
      );
      const extension = rows[0];

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "extension.create",
        resourceType: "extension",
        resourceId: extension.id,
        metadata: { number, userId },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });

      // Provisioning is attempted inline but reported as async state (202).
      const provisioning = await runProvisioning(extension, ctx);
      const fresh = await loadExtension(organisationId, extension.id);

      if (provisioning.provisioningStatus === PROVISIONING_STATES.FAILED) {
        accepted(ctx.res, { ...publicExtension(fresh), warning: provisioning.error }, { requestId: ctx.requestId });
        return;
      }
      created(ctx.res, publicExtension(fresh), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/extensions/:id",
    auth: "session",
    permission: PERMISSIONS.EXTENSIONS_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const extension = await loadExtension(organisationId, ctx.params.id);
      if (extension.status === EXTENSION_STATUSES.REVOKED) {
        throw new ApiError(409, "CONFLICT", "Revoked extensions cannot be modified.");
      }

      const displayName = optionalString(ctx.body, "displayName", { max: 120, allowEmpty: false });
      const hasUser = Object.prototype.hasOwnProperty.call(ctx.body || {}, "userId");
      const userId = optionalString(ctx.body, "userId", { max: 64, allowEmpty: true });
      const maxConcurrentCalls = optionalInteger(ctx.body, "maxConcurrentCalls", { min: 1, max: 20 });
      const allowExternal = optionalBoolean(ctx.body, "allowExternal");

      if (hasUser && userId) {
        const member = await query(
          `SELECT id FROM organisation_members WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
          [organisationId, userId]
        );
        if (!member.rows[0]) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
            userId: "That user is not an active member of this organisation.",
          });
        }
      }

      const updates = [];
      const params = [extension.id];
      if (displayName) {
        const check = validateName(displayName, { field: "Display name", max: 120 });
        if (!check.valid) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
            displayName: check.message,
          });
        }
        params.push(displayName);
        updates.push(`display_name = $${params.length}`);
      }
      if (hasUser) {
        params.push(userId || null);
        updates.push(`user_id = $${params.length}`);
      }
      if (maxConcurrentCalls !== undefined) {
        params.push(maxConcurrentCalls);
        updates.push(`max_concurrent_calls = $${params.length}`);
      }
      if (allowExternal !== undefined) {
        params.push(allowExternal);
        updates.push(`allow_external = $${params.length}`);
      }
      if (!updates.length) throw new ApiError(422, "VALIDATION_ERROR", "No updatable fields were supplied.");

      updates.push("updated_at = now()");
      await query(`UPDATE extensions SET ${updates.join(", ")} WHERE id = $1`, params);

      const fresh = await loadExtension(organisationId, extension.id);
      if (fresh.provisioning_status === PROVISIONING_STATES.READY) {
        await runProvisioning(fresh, ctx, { mode: "update" });
      }

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "extension.update",
        resourceType: "extension",
        resourceId: extension.id,
        metadata: { fields: Object.keys(ctx.body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, publicExtension(await loadExtension(organisationId, extension.id)), {
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "POST",
    path: "/extensions/:id/disable",
    auth: "session",
    permission: PERMISSIONS.EXTENSIONS_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const extension = await loadExtension(organisationId, ctx.params.id);
      if (extension.status === EXTENSION_STATUSES.REVOKED) {
        throw new ApiError(409, "CONFLICT", "Revoked extensions cannot be disabled again.");
      }
      if (isPbxConfigured() && extension.pbx_endpoint_id) {
        await updateExtensionOnPbx({ ...extension, pbx_endpoint_id: extension.pbx_endpoint_id }, { enabled: false });
      }
      await query(
        `UPDATE extensions SET status = 'disabled', provisioning_status = 'disabled', updated_at = now() WHERE id = $1`,
        [extension.id]
      );
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "extension.disable",
        resourceType: "extension",
        resourceId: extension.id,
        metadata: { number: extension.number },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, publicExtension(await loadExtension(organisationId, extension.id)), {
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "POST",
    path: "/extensions/:id/enable",
    auth: "session",
    permission: PERMISSIONS.EXTENSIONS_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const extension = await loadExtension(organisationId, ctx.params.id);
      if (extension.status === EXTENSION_STATUSES.REVOKED) {
        throw new ApiError(409, "CONFLICT", "Revoked extensions cannot be re-enabled.");
      }
      await runProvisioning(extension, ctx, { mode: "update" });
      const fresh = await loadExtension(organisationId, extension.id);
      if (fresh.provisioning_status === PROVISIONING_STATES.READY) {
        await query(`UPDATE extensions SET status = 'active', updated_at = now() WHERE id = $1`, [extension.id]);
      }
      success(ctx.res, publicExtension(await loadExtension(organisationId, extension.id)), {
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "POST",
    path: "/extensions/:id/rotate",
    auth: "session",
    permission: PERMISSIONS.EXTENSIONS_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const extension = await loadExtension(organisationId, ctx.params.id);
      if (extension.status === EXTENSION_STATUSES.REVOKED) {
        throw new ApiError(409, "CONFLICT", "Revoked extensions cannot be rotated.");
      }
      if (!isPbxConfigured() || !extension.pbx_endpoint_id) {
        throw new ApiError(
          503,
          "DEPENDENCY_UNAVAILABLE",
          "Credential rotation requires a configured PBX endpoint."
        );
      }
      // Ask the PBX to rotate the SIP secret. The new secret never leaves the
      // server; the browser re-fetches public identifiers only (§13.3).
      const result = await updateExtensionOnPbx(extension, { rotateCredentials: true });
      if (!result.ok) {
        throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `Rotation failed: ${result.error}`);
      }
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "extension.rotate_credentials",
        resourceType: "extension",
        resourceId: extension.id,
        metadata: { number: extension.number },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { rotated: true, extensionId: extension.id }, { requestId: ctx.requestId });
    },
  },

  {
    method: "DELETE",
    path: "/extensions/:id",
    auth: "session",
    permission: PERMISSIONS.EXTENSIONS_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const extension = await loadExtension(organisationId, ctx.params.id);
      if (extension.status === EXTENSION_STATUSES.REVOKED) {
        throw new ApiError(409, "CONFLICT", "This extension has already been revoked.");
      }
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
        action: "extension.revoke",
        resourceType: "extension",
        resourceId: extension.id,
        metadata: { number: extension.number },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      noContent(ctx.res);
    },
  },
];

export default createHandler(routes);
