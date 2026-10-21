/**
 * Authorisation: organisation-scoped RBAC helpers.
 * Every tenant query must be filtered by organisation_id obtained here - never
 * from client-supplied identifiers alone (§13.4).
 */
import { hasPermission, PERMISSIONS, ROLES } from "@cloudtel/shared";
import { query } from "./database.js";
import { ApiError } from "./response.js";

export { PERMISSIONS, ROLES };

/** Active membership row for a user inside an organisation. */
export async function getMembership(userId, organisationId) {
  if (!userId || !organisationId) return null;
  const { rows } = await query(
    `SELECT id, role, status FROM organisation_members
      WHERE user_id = $1 AND organisation_id = $2`,
    [userId, organisationId]
  );
  return rows[0] || null;
}

export async function listUserMemberships(userId) {
  const { rows } = await query(
    `SELECT m.organisation_id, m.role, m.status, o.name AS organisation_name, o.slug AS organisation_slug
       FROM organisation_members m
       JOIN organisations o ON o.id = m.organisation_id
      WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'
      ORDER BY o.name`,
    [userId]
  );
  return rows;
}

/**
 * Effective role for the request context.
 * Platform admins act with full permissions across organisations.
 */
export function effectiveRole(context) {
  if (!context) return null;
  if (context.isPlatformAdmin) return ROLES.PLATFORM_ADMIN;
  return context.role || null;
}

export function contextCan(context, permission) {
  const role = effectiveRole(context);
  return role ? hasPermission(role, permission) : false;
}

/** Throw 403 unless the context holds the permission. */
export function requirePermission(context, permission) {
  if (!contextCan(context, permission)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return true;
}

/** Throw 403 unless the context belongs to an organisation. */
export function requireOrganisation(context) {
  if (!context?.organisationId) {
    throw new ApiError(403, "FORBIDDEN", "Select an organisation to continue.");
  }
  return context.organisationId;
}

/** Guard: actor may not manage a peer or superior (unless self-edit is allowed). */
export function assertOutranks(actorRole, targetRole, { allowSelf = false, actorId, targetId } = {}) {
  if (allowSelf && actorId && actorId === targetId) return true;
  const actorRank = contextRoleRank(actorRole);
  const targetRank = contextRoleRank(targetRole);
  if (actorRank <= targetRank) {
    throw new ApiError(403, "FORBIDDEN", "You cannot manage a user with an equal or higher role.");
  }
  return true;
}

function contextRoleRank(role) {
  return { user: 10, auditor: 10, supervisor: 20, admin: 30, owner: 40, platform_admin: 50 }[role] || 0;
}

/** Ensure a contact is visible and modifiable within the caller's scope. */
export function canModifyContact(context, contact) {
  if (!contact || contact.organisation_id !== context.organisationId) return false;
  if (contextCan(context, PERMISSIONS.CONTACTS_UPDATE_ORG)) return true;
  return Boolean(contact.owner_user_id && contact.owner_user_id === context.user.id);
}

export function canDeleteContact(context, contact) {
  if (!contact || contact.organisation_id !== context.organisationId) return false;
  if (contextCan(context, PERMISSIONS.CONTACTS_DELETE_ORG)) return true;
  return Boolean(contact.owner_user_id && contact.owner_user_id === context.user.id);
}
