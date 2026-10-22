/**
 * Serverless function 2: Users
 * GET    /api/v1/users
 * GET    /api/v1/users/me
 * PATCH  /api/v1/users/me
 * GET    /api/v1/users/me/sessions
 * DELETE /api/v1/users/me/sessions/:id
 * GET    /api/v1/users/invitations
 * POST   /api/v1/users/invitations
 * GET    /api/v1/users/:id
 * POST   /api/v1/users
 * PATCH  /api/v1/users/:id
 * DELETE /api/v1/users/:id
 */
import { MEMBER_ROLES, USER_STATUSES, validateEmail, validateName, validatePassword } from "@cloudtel/shared";
import { success, created, noContent, ApiError, handler } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import { hashPassword, listUserSessions, revokeAllUserSessions, revokeSessionById } from "../../../lib/authentication.js";
import {
  PERMISSIONS,
  assertOutranks,
  getMembership,
  requireOrganisation,
  requirePermission,
} from "../../../lib/authorisation.js";
import { audit } from "../../../lib/audit.js";
import { optionalString, requireString } from "../../../lib/validation.js";
import { isValidId, parsePagination } from "@cloudtel/shared";

const ASSIGNABLE_ROLES = [MEMBER_ROLES.OWNER, MEMBER_ROLES.ADMIN, MEMBER_ROLES.SUPERVISOR, MEMBER_ROLES.USER, MEMBER_ROLES.AUDITOR];

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    role: row.role || null,
    memberStatus: row.member_status || undefined,
    isPlatformAdmin: row.is_platform_admin,
    extensionNumber: row.extension_number || null,
    extensionId: row.extension_id || null,
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at,
  };
}

const LIST_SQL = `
  SELECT u.id, u.email, u.name, u.status, u.is_platform_admin, u.last_login_at, u.created_at,
         m.role, m.status AS member_status,
         e.id AS extension_id, e.number AS extension_number
    FROM organisation_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN extensions e ON e.user_id = u.id AND e.organisation_id = m.organisation_id AND e.status = 'active'
   WHERE m.organisation_id = $1 AND m.status = 'active' AND u.status <> 'deactivated'
`;

const routes = [
  {
    method: "GET",
    path: "/users",
    auth: "session",
    permission: PERMISSIONS.USERS_READ,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { page, pageSize, offset, limit } = parsePagination(ctx.query);
      const search = (ctx.query.search || "").trim().slice(0, 80);
      const params = [organisationId];
      let where = "";
      if (search) {
        params.push(`%${search}%`);
        where = ` AND (u.name ILIKE $2 OR u.email ILIKE $2)`;
      }
      params.push(limit, offset);
      const { rows } = await query(
        `${LIST_SQL}${where} ORDER BY u.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const countParams = [organisationId];
      let countWhere = "";
      if (search) {
        countParams.push(`%${search}%`);
        countWhere = ` AND (u.name ILIKE $2 OR u.email ILIKE $2)`;
      }
      const countResult = await query(
        `SELECT count(*)::int AS total
           FROM organisation_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.organisation_id = $1 AND m.status = 'active' AND u.status <> 'deactivated'${countWhere}`,
        countParams
      );
      success(
        ctx.res,
        rows.map(publicUser),
        { meta: { page, pageSize, total: countResult.rows[0].total }, requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/users/me",
    auth: "session",
    handle: async (ctx) => {
      const { rows } = await query(
        `SELECT id, email, name, status, is_platform_admin, last_login_at, created_at, updated_at
           FROM users WHERE id = $1`,
        [ctx.user.id]
      );
      const row = rows[0];
      if (!row) throw new ApiError(404, "NOT_FOUND", "User not found.");
      const memberships = await query(
        `SELECT m.organisation_id, m.role, m.status, o.name AS organisation_name, o.slug AS organisation_slug
           FROM organisation_members m
           JOIN organisations o ON o.id = m.organisation_id
          WHERE m.user_id = $1
          ORDER BY o.name`,
        [ctx.user.id]
      );
      success(
        ctx.res,
        {
          id: row.id,
          email: row.email,
          name: row.name,
          status: row.status,
          isPlatformAdmin: row.is_platform_admin,
          lastLoginAt: row.last_login_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          memberships: memberships.rows.map((m) => ({
            organisationId: m.organisation_id,
            organisationName: m.organisation_name,
            organisationSlug: m.organisation_slug,
            role: m.role,
            status: m.status,
          })),
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "PATCH",
    path: "/users/me",
    auth: "session",
    handle: async (ctx) => {
      const name = optionalString(ctx.body, "name", { max: 120, allowEmpty: false });
      const email = optionalString(ctx.body, "email", { max: 254, allowEmpty: false });
      const updates = [];
      const params = [ctx.user.id];
      if (name) {
        const check = validateName(name);
        if (!check.valid) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { name: check.message });
        }
        params.push(name);
        updates.push(`name = $${params.length}`);
      }
      if (email) {
        const lowered = email.toLowerCase();
        const check = validateEmail(lowered);
        if (!check.valid) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { email: check.message });
        }
        const clash = await query(`SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2`, [lowered, ctx.user.id]);
        if (clash.rows[0]) {
          throw new ApiError(409, "CONFLICT", "A user with this email address already exists.");
        }
        params.push(lowered);
        updates.push(`email = $${params.length}`);
      }
      if (!updates.length) throw new ApiError(422, "VALIDATION_ERROR", "No updatable fields were supplied.");
      updates.push("updated_at = now()");
      const { rows } = await query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $1
         RETURNING id, email, name, status, is_platform_admin, last_login_at, created_at, updated_at`,
        params
      );
      await audit({
        organisationId: ctx.organisationId,
        userId: ctx.user.id,
        action: "user.self_update",
        resourceType: "user",
        resourceId: ctx.user.id,
        metadata: { fields: Object.keys(ctx.body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      const r = rows[0];
      success(
        ctx.res,
        {
          id: r.id,
          email: r.email,
          name: r.name,
          status: r.status,
          isPlatformAdmin: r.is_platform_admin,
          lastLoginAt: r.last_login_at,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/users/me/sessions",
    auth: "session",
    handle: async (ctx) => {
      const sessions = await listUserSessions(ctx.user.id);
      success(
        ctx.res,
        sessions.map((s) => ({
          id: s.id,
          ip: s.ip,
          userAgent: s.user_agent,
          createdAt: s.created_at,
          lastSeenAt: s.last_seen_at,
          expiresAt: s.expires_at,
          current: s.id === ctx.session?.id,
        })),
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "DELETE",
    path: "/users/me/sessions/:id",
    auth: "session",
    handle: async (ctx) => {
      if (!isValidId(ctx.params.id)) throw new ApiError(404, "NOT_FOUND", "Session not found.");
      const { rows } = await query(`SELECT id FROM sessions WHERE id = $1 AND user_id = $2`, [
        ctx.params.id,
        ctx.user.id,
      ]);
      if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Session not found.");
      await revokeSessionById(ctx.params.id);
      await audit({
        organisationId: ctx.organisationId,
        userId: ctx.user.id,
        action: "user.session_revoke",
        resourceType: "session",
        resourceId: ctx.params.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      noContent(ctx.res);
    },
  },

  {
    method: "GET",
    path: "/users/invitations",
    auth: "session",
    permission: PERMISSIONS.USERS_READ,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(
        `SELECT u.id, u.email, u.name, u.status, u.created_at, m.role, m.invited_by
           FROM organisation_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.organisation_id = $1 AND u.status = $2
          ORDER BY u.created_at DESC`,
        [organisationId, USER_STATUSES.INVITED]
      );
      success(
        ctx.res,
        rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          status: r.status,
          role: r.role,
          invitedBy: r.invited_by,
          createdAt: r.created_at,
        })),
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "POST",
    path: "/users/invitations",
    auth: "session",
    permission: PERMISSIONS.USERS_CREATE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const email = requireString(ctx.body, "email", { max: 254 }).toLowerCase();
      const role = optionalString(ctx.body, "role", { max: 30 }) || MEMBER_ROLES.USER;
      const name = optionalString(ctx.body, "name", { max: 120, allowEmpty: false }) || email.split("@")[0];

      if (!ASSIGNABLE_ROLES.includes(role)) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { role: "Unsupported role." });
      }
      assertOutranks(ctx.role, role, { actorId: ctx.user.id });
      const emailCheck = validateEmail(email);
      if (!emailCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { email: emailCheck.message });
      }
      const nameCheck = validateName(name);
      if (!nameCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { name: nameCheck.message });
      }

      const existing = await query(`SELECT id, status FROM users WHERE lower(email) = lower($1)`, [email]);
      let userId;
      if (existing.rows[0]) {
        userId = existing.rows[0].id;
        const already = await query(
          `SELECT id FROM organisation_members WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'`,
          [organisationId, userId]
        );
        if (already.rows[0]) {
          throw new ApiError(409, "CONFLICT", "That person is already a member of this organisation.");
        }
      } else {
        const { rows } = await query(
          `INSERT INTO users (email, name, status) VALUES ($1, $2, $3) RETURNING id`,
          [email, name, USER_STATUSES.INVITED]
        );
        userId = rows[0].id;
      }

      await query(
        `INSERT INTO organisation_members (organisation_id, user_id, role, invited_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organisation_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'active', invited_by = EXCLUDED.invited_by, updated_at = now()`,
        [organisationId, userId, role, ctx.user.id]
      );

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "user.invite",
        resourceType: "user",
        resourceId: userId,
        metadata: { email, role },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      created(ctx.res, { id: userId, email, name, role, status: USER_STATUSES.INVITED }, { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/users/:id",
    auth: "session",
    permission: PERMISSIONS.USERS_READ,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(
        `${LIST_SQL} AND u.id = $2`,
        [organisationId, ctx.params.id]
      );
      if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "User not found in this organisation.");
      success(ctx.res, publicUser(rows[0]), { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/users",
    auth: "session",
    permission: PERMISSIONS.USERS_CREATE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const name = requireString(ctx.body, "name", { max: 120 });
      const email = requireString(ctx.body, "email", { max: 254 }).toLowerCase();
      const role = optionalString(ctx.body, "role", { max: 30 }) || MEMBER_ROLES.USER;
      const password = optionalString(ctx.body, "password", { max: 200, allowEmpty: false });
      const extensionNumber = optionalString(ctx.body, "extensionNumber", { max: 12, allowEmpty: true });

      if (!ASSIGNABLE_ROLES.includes(role)) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          role: "Unsupported role.",
        });
      }
      assertOutranks(ctx.role, role, { actorId: ctx.user.id });

      const nameCheck = validateName(name);
      if (!nameCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { name: nameCheck.message });
      }
      const emailCheck = validateEmail(email);
      if (!emailCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { email: emailCheck.message });
      }
      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { password: passwordCheck.message });
      }

      const existing = await query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
      if (existing.rows[0]) {
        throw new ApiError(409, "CONFLICT", "A user with this email address already exists.");
      }

      const passwordHash = await hashPassword(password);
      const { rows } = await query(
        `INSERT INTO users (email, name, password_hash, status)
         VALUES ($1, $2, $3, $4) RETURNING id, email, name, status, is_platform_admin, created_at`,
        [email, name, passwordHash, USER_STATUSES.ACTIVE]
      );
      const user = rows[0];

      await query(
        `INSERT INTO organisation_members (organisation_id, user_id, role, invited_by)
         VALUES ($1, $2, $3, $4)`,
        [organisationId, user.id, role, ctx.user.id]
      );

      let extension = null;
      if (extensionNumber) {
        const ext = await query(
          `INSERT INTO extensions (organisation_id, user_id, number, display_name, created_by, provisioning_status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING id, number, provisioning_status, status`,
          [organisationId, user.id, extensionNumber, name, ctx.user.id]
        );
        extension = ext.rows[0];
      }

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "user.create",
        resourceType: "user",
        resourceId: user.id,
        metadata: { email, role, extensionNumber: extensionNumber || null },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });

      created(ctx.res, { ...publicUser({ ...user, role, member_status: "active", extension_number: extension?.number || null, extension_id: extension?.id || null }) }, {
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "PATCH",
    path: "/users/:id",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const targetId = ctx.params.id;
      if (!isValidId(targetId)) throw new ApiError(404, "NOT_FOUND", "User not found.");

      const membership = await getMembership(targetId, organisationId);
      if (!membership) throw new ApiError(404, "NOT_FOUND", "User not found in this organisation.");

      const isSelf = targetId === ctx.user.id;
      if (!isSelf) {
        requirePermission(ctx, PERMISSIONS.USERS_UPDATE);
        assertOutranks(ctx.role, membership.role, { actorId: ctx.user.id, targetId });
      }

      const name = optionalString(ctx.body, "name", { max: 120, allowEmpty: false });
      const email = optionalString(ctx.body, "email", { max: 254, allowEmpty: false });
      const role = optionalString(ctx.body, "role", { max: 30, allowEmpty: false });
      const newPassword = optionalString(ctx.body, "password", { max: 200, allowEmpty: false });

      const updates = [];
      const params = [targetId];
      if (name) {
        const check = validateName(name);
        if (!check.valid) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { name: check.message });
        }
        params.push(name);
        updates.push(`name = $${params.length}`);
      }
      if (email) {
        const lowered = email.toLowerCase();
        const check = validateEmail(lowered);
        if (!check.valid) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { email: check.message });
        }
        const clash = await query(`SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2`, [lowered, targetId]);
        if (clash.rows[0]) {
          throw new ApiError(409, "CONFLICT", "A user with this email address already exists.");
        }
        params.push(lowered);
        updates.push(`email = $${params.length}`);
      }
      if (role && !isSelf) {
        if (!ASSIGNABLE_ROLES.includes(role)) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { role: "Unsupported role." });
        }
        assertOutranks(ctx.role, role, { actorId: ctx.user.id, targetId });
        // Never allow removing the last owner.
        if (membership.role === MEMBER_ROLES.OWNER && role !== MEMBER_ROLES.OWNER) {
          throw new ApiError(409, "CONFLICT", "Transfer ownership before changing this user's role.");
        }
        params.push(role);
        await query(`UPDATE organisation_members SET role = $2, updated_at = now() WHERE id = $1`, [
          membership.id,
          role,
        ]);
      }
      if (newPassword) {
        if (!isSelf) requirePermission(ctx, PERMISSIONS.USERS_SUSPEND);
        const check = validatePassword(newPassword);
        if (!check.valid) {
          throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", { password: check.message });
        }
        params.push(await hashPassword(newPassword));
        updates.push(`password_hash = $${params.length}`);
        await revokeAllUserSessions(targetId);
      }

      if (updates.length) {
        updates.push("updated_at = now()");
        await query(`UPDATE users SET ${updates.join(", ")} WHERE id = $1`, params);
      }

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "user.update",
        resourceType: "user",
        resourceId: targetId,
        metadata: { fields: Object.keys(ctx.body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });

      const { rows } = await query(`${LIST_SQL} AND u.id = $2`, [organisationId, targetId]);
      success(ctx.res, publicUser(rows[0]), { requestId: ctx.requestId });
    },
  },

  {
    method: "DELETE",
    path: "/users/:id",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const targetId = ctx.params.id;
      if (!isValidId(targetId)) throw new ApiError(404, "NOT_FOUND", "User not found.");
      if (targetId === ctx.user.id) {
        throw new ApiError(409, "CONFLICT", "You cannot remove your own account from here.");
      }
      requirePermission(ctx, PERMISSIONS.USERS_SUSPEND);
      const membership = await getMembership(targetId, organisationId);
      if (!membership) throw new ApiError(404, "NOT_FOUND", "User not found in this organisation.");
      assertOutranks(ctx.role, membership.role, { actorId: ctx.user.id, targetId });
      if (membership.role === MEMBER_ROLES.OWNER) {
        throw new ApiError(409, "CONFLICT", "The organisation owner cannot be removed.");
      }

      await query(`UPDATE organisation_members SET status = 'suspended', updated_at = now() WHERE id = $1`, [
        membership.id,
      ]);
      await query(`UPDATE users SET status = 'deactivated', updated_at = now() WHERE id = $1`, [targetId]);
      await revokeAllUserSessions(targetId);

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "user.deactivate",
        resourceType: "user",
        resourceId: targetId,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      noContent(ctx.res);
    },
  },
];

export default handler(createHandler(routes));
