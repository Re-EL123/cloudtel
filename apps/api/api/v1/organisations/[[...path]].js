/**
 * Serverless function 3: Organisations
 * GET   /api/v1/organisations
 * GET   /api/v1/organisations/current
 * PATCH /api/v1/organisations/current
 * GET   /api/v1/organisations/mine
 * POST  /api/v1/organisations/switch
 * GET   /api/v1/organisations/:id
 * POST  /api/v1/organisations
 * PATCH /api/v1/organisations/:id
 * GET   /api/v1/organisations/:id/members
 * PATCH /api/v1/organisations/:id/members/:userId
 * DELETE /api/v1/organisations/:id/members/:userId
 */
import { success, created, noContent, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query, withTransaction } from "../../../lib/database.js";
import { setSessionOrganisation, revokeAllUserSessions } from "../../../lib/authentication.js";
import {
  PERMISSIONS,
  ROLES,
  assertOutranks,
  getMembership,
  listUserMemberships,
  requireOrganisation,
  requirePermission,
} from "../../../lib/authorisation.js";
import { MEMBER_ROLES, USER_STATUSES, isValidId } from "@cloudtel/shared";
import { audit } from "../../../lib/audit.js";
import { optionalString, requireString } from "../../../lib/validation.js";

function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "org"
  );
}

function publicOrganisation(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    defaultTimezone: row.default_timezone,
    settings: row.settings || {},
    role: row.role || undefined,
    createdAt: row.created_at,
  };
}

/** Organisation context check: member or platform administrator. */
async function assertOrgAccess(context, organisationId) {
  if (context.isPlatformAdmin) return "platform_admin";
  const memberships = await listUserMemberships(context.user.id);
  const membership = memberships.find((m) => m.organisation_id === organisationId);
  if (!membership) throw new ApiError(404, "NOT_FOUND", "Organisation not found.");
  return membership.role;
}

const routes = [
  {
    method: "GET",
    path: "/organisations",
    auth: "session",
    handle: async (ctx) => {
      if (ctx.isPlatformAdmin) {
        const { rows } = await query(`SELECT * FROM organisations ORDER BY name LIMIT 200`);
        success(ctx.res, rows.map((r) => publicOrganisation(r)), { requestId: ctx.requestId });
        return;
      }
      const memberships = await listUserMemberships(ctx.user.id);
      const ids = memberships.map((m) => m.organisation_id);
      if (ids.length === 0) {
        success(ctx.res, [], { requestId: ctx.requestId });
        return;
      }
      const { rows } = await query(`SELECT * FROM organisations WHERE id = ANY($1::uuid[]) ORDER BY name`, [ids]);
      const roleById = Object.fromEntries(memberships.map((m) => [m.organisation_id, m.role]));
      success(
        ctx.res,
        rows.map((r) => publicOrganisation({ ...r, role: roleById[r.id] })),
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/organisations/mine",
    auth: "session",
    handle: async (ctx) => {
      const memberships = await listUserMemberships(ctx.user.id);
      success(
        ctx.res,
        memberships.map((m) => ({
          id: m.organisation_id,
          name: m.organisation_name,
          slug: m.organisation_slug,
          role: m.role,
        })),
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/organisations/current",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(`SELECT * FROM organisations WHERE id = $1`, [organisationId]);
      if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Organisation not found.");
      success(ctx.res, publicOrganisation({ ...rows[0], role: ctx.role }), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/organisations/current",
    auth: "session",
    permission: PERMISSIONS.ORG_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const name = optionalString(ctx.body, "name", { max: 120, allowEmpty: false });
      const timezone = optionalString(ctx.body, "defaultTimezone", { max: 64, allowEmpty: false });
      const updates = [];
      const params = [organisationId];
      if (name) {
        params.push(name);
        updates.push(`name = $${params.length}`);
      }
      if (timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: timezone });
        } catch {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
            defaultTimezone: "Unknown time zone.",
          });
        }
        params.push(timezone);
        updates.push(`default_timezone = $${params.length}`);
      }
      if (!updates.length) throw new ApiError(422, "VALIDATION_ERROR", "No updatable fields were supplied.");
      updates.push("updated_at = now()");
      const { rows } = await query(`UPDATE organisations SET ${updates.join(", ")} WHERE id = $1 RETURNING *`, params);
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "organisation.update",
        resourceType: "organisation",
        resourceId: organisationId,
        metadata: { fields: Object.keys(ctx.body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, publicOrganisation(rows[0]), { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/organisations/switch",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireString(ctx.body, "organisationId", { max: 64 });
      if (!isValidId(organisationId)) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          organisationId: "Invalid organisation.",
        });
      }
      const memberships = await listUserMemberships(ctx.user.id);
      const membership = memberships.find((m) => m.organisation_id === organisationId);
      if (!membership && !ctx.isPlatformAdmin) {
        throw new ApiError(403, "FORBIDDEN", "You are not a member of that organisation.");
      }
      const role = ctx.isPlatformAdmin ? ROLES.PLATFORM_ADMIN : membership.role;
      if (ctx.session?.id) await setSessionOrganisation(ctx.session.id, organisationId, role);
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "organisation.switch",
        resourceType: "session",
        resourceId: ctx.session?.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(
        ctx.res,
        {
          organisationId,
          role,
          name: membership?.organisation_name || null,
          slug: membership?.organisation_slug || null,
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/organisations/:id",
    auth: "session",
    handle: async (ctx) => {
      const role = await assertOrgAccess(ctx, ctx.params.id);
      const { rows } = await query(`SELECT * FROM organisations WHERE id = $1`, [ctx.params.id]);
      if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Organisation not found.");
      success(ctx.res, publicOrganisation({ ...rows[0], role }), { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/organisations",
    auth: "session",
    handle: async (ctx) => {
      const name = requireString(ctx.body, "name", { max: 120 });
      const slugInput = optionalString(ctx.body, "slug", { max: 60, allowEmpty: true });
      const slug = slugify(slugInput || name);

      const clash = await query(`SELECT id FROM organisations WHERE slug = $1`, [slug]);
      if (clash.rows[0]) {
        throw new ApiError(409, "CONFLICT", "An organisation with a similar name already exists. Choose another name.");
      }

      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO organisations (name, slug) VALUES ($1, $2) RETURNING *`,
          [name, slug]
        );
        const organisation = rows[0];
        // The creator becomes the owner. Platform admins may create on behalf of
        // others, but the creator still starts as owner until re-assigned.
        await client.query(
          `INSERT INTO organisation_members (organisation_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [organisation.id, ctx.user.id]
        );
        await client.query(`INSERT INTO subscriptions (organisation_id) VALUES ($1)`, [organisation.id]);
        return organisation;
      });

      await audit({
        organisationId: result.id,
        userId: ctx.user.id,
        action: "organisation.create",
        resourceType: "organisation",
        resourceId: result.id,
        metadata: { name, slug },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      created(ctx.res, publicOrganisation({ ...result, role: "owner" }), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/organisations/:id",
    auth: "session",
    handle: async (ctx) => {
      const role = await assertOrgAccess(ctx, ctx.params.id);
      // Platform admins bypass membership permission checks.
      if (!ctx.isPlatformAdmin) {
        ctx.role = role;
        requirePermission(ctx, PERMISSIONS.ORG_MANAGE);
      }

      const name = optionalString(ctx.body, "name", { max: 120, allowEmpty: false });
      const timezone = optionalString(ctx.body, "defaultTimezone", { max: 64, allowEmpty: false });

      const updates = [];
      const params = [ctx.params.id];
      if (name) {
        params.push(name);
        updates.push(`name = $${params.length}`);
      }
      if (timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: timezone });
        } catch {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
            defaultTimezone: "Unknown time zone.",
          });
        }
        params.push(timezone);
        updates.push(`default_timezone = $${params.length}`);
      }
      if (!updates.length) {
        throw new ApiError(422, "VALIDATION_ERROR", "No updatable fields were supplied.");
      }
      updates.push("updated_at = now()");
      const { rows } = await query(
        `UPDATE organisations SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
        params
      );

      await audit({
        organisationId: ctx.params.id,
        userId: ctx.user.id,
        action: "organisation.update",
        resourceType: "organisation",
        resourceId: ctx.params.id,
        metadata: { fields: Object.keys(ctx.body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, publicOrganisation(rows[0]), { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/organisations/:id/members",
    auth: "session",
    handle: async (ctx) => {
      const role = await assertOrgAccess(ctx, ctx.params.id);
      if (!ctx.isPlatformAdmin) {
        ctx.role = role;
        requirePermission(ctx, PERMISSIONS.USERS_READ);
      }
      const { rows } = await query(
        `SELECT m.id, m.role, m.status, m.created_at, u.id AS user_id, u.name, u.email, u.status AS user_status
           FROM organisation_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.organisation_id = $1
          ORDER BY u.name`,
        [ctx.params.id]
      );
      success(
        ctx.res,
        rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          name: r.name,
          email: r.email,
          role: r.role,
          status: r.status,
          userStatus: r.user_status,
          joinedAt: r.created_at,
        })),
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "PATCH",
    path: "/organisations/:id/members/:userId",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = ctx.params.id;
      const role = await assertOrgAccess(ctx, organisationId);
      if (!ctx.isPlatformAdmin) {
        ctx.role = role;
        requirePermission(ctx, PERMISSIONS.USERS_UPDATE);
      }
      const targetUserId = ctx.params.userId;
      if (!isValidId(targetUserId)) throw new ApiError(404, "NOT_FOUND", "Member not found.");
      const membership = await getMembership(targetUserId, organisationId);
      if (!membership) throw new ApiError(404, "NOT_FOUND", "Member not found in this organisation.");
      if (!ctx.isPlatformAdmin) assertOutranks(ctx.role, membership.role, { actorId: ctx.user.id, targetId: targetUserId });

      const newRole = optionalString(ctx.body, "role", { max: 30, allowEmpty: false });
      const newStatus = optionalString(ctx.body, "status", { max: 20, allowEmpty: false });
      const updates = [];
      const params = [membership.id];
      if (newRole) {
        if (!Object.values(MEMBER_ROLES).includes(newRole)) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { role: "Unsupported role." });
        }
        if (!ctx.isPlatformAdmin) assertOutranks(ctx.role, newRole, { actorId: ctx.user.id, targetId: targetUserId });
        if (membership.role === MEMBER_ROLES.OWNER && newRole !== MEMBER_ROLES.OWNER) {
          throw new ApiError(409, "CONFLICT", "Transfer ownership before changing the owner's role.");
        }
        params.push(newRole);
        updates.push(`role = $${params.length}`);
      }
      if (newStatus) {
        if (!["active", "suspended"].includes(newStatus)) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { status: "Choose active or suspended." });
        }
        if (membership.role === MEMBER_ROLES.OWNER && newStatus === "suspended") {
          throw new ApiError(409, "CONFLICT", "The organisation owner cannot be suspended.");
        }
        params.push(newStatus);
        updates.push(`status = $${params.length}`);
      }
      if (!updates.length) throw new ApiError(422, "VALIDATION_ERROR", "No updatable fields were supplied.");
      updates.push("updated_at = now()");
      await query(`UPDATE organisation_members SET ${updates.join(", ")} WHERE id = $1`, params);
      if (newStatus === "suspended") {
        await query(`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, [
          targetUserId,
          USER_STATUSES.SUSPENDED,
        ]);
        await revokeAllUserSessions(targetUserId);
      }
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "organisation.member_update",
        resourceType: "organisation_member",
        resourceId: membership.id,
        metadata: { targetUserId, fields: Object.keys(ctx.body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { id: membership.id, userId: targetUserId, role: newRole || membership.role, status: newStatus || membership.status }, {
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "DELETE",
    path: "/organisations/:id/members/:userId",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = ctx.params.id;
      const role = await assertOrgAccess(ctx, organisationId);
      if (!ctx.isPlatformAdmin) {
        ctx.role = role;
        requirePermission(ctx, PERMISSIONS.USERS_SUSPEND);
      }
      const targetUserId = ctx.params.userId;
      if (!isValidId(targetUserId)) throw new ApiError(404, "NOT_FOUND", "Member not found.");
      if (targetUserId === ctx.user.id) throw new ApiError(409, "CONFLICT", "You cannot remove yourself.");
      const membership = await getMembership(targetUserId, organisationId);
      if (!membership) throw new ApiError(404, "NOT_FOUND", "Member not found in this organisation.");
      if (!ctx.isPlatformAdmin) assertOutranks(ctx.role, membership.role, { actorId: ctx.user.id, targetId: targetUserId });
      if (membership.role === MEMBER_ROLES.OWNER) {
        throw new ApiError(409, "CONFLICT", "The organisation owner cannot be removed.");
      }
      await query(`DELETE FROM organisation_members WHERE id = $1`, [membership.id]);
      await revokeAllUserSessions(targetUserId);
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "organisation.member_remove",
        resourceType: "organisation_member",
        resourceId: membership.id,
        metadata: { targetUserId },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      noContent(ctx.res);
    },
  },
];

export default createHandler(routes);
