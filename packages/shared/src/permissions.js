/**
 * CloudTel permission model (organisation-scoped RBAC).
 * The API re-checks every permission server side; the UI uses the same map to
 * show or hide controls. Never treat UI hiding as access control.
 */
import { ROLES } from "./roles.js";

export const PERMISSIONS = Object.freeze({
  ORG_READ: "org:read",
  ORG_MANAGE: "org:manage",

  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_SUSPEND: "users:suspend",

  EXTENSIONS_READ: "extensions:read",
  EXTENSIONS_MANAGE: "extensions:manage",
  EXTENSIONS_REVOKE: "extensions:revoke",

  CONTACTS_READ: "contacts:read",
  CONTACTS_CREATE: "contacts:create",
  CONTACTS_UPDATE_ORG: "contacts:update_org",
  CONTACTS_DELETE_ORG: "contacts:delete_org",

  CALLS_READ_OWN: "calls:read_own",
  CALLS_READ_TEAM: "calls:read_team",
  CALLS_EXPORT: "calls:export",

  CALL_MAKE: "call:make",
  CALL_TRANSFER: "call:transfer",

  SETTINGS_READ: "settings:read",
  SETTINGS_MANAGE: "settings:manage",

  ADMIN_DASHBOARD: "admin:dashboard",
  ADMIN_AUDIT: "admin:audit",
  ADMIN_USAGE: "admin:usage",

  BILLING_READ: "billing:read",
  BILLING_MANAGE: "billing:manage",
});

const USER_PERMS = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.CONTACTS_READ,
  PERMISSIONS.CONTACTS_CREATE,
  PERMISSIONS.CONTACTS_UPDATE_ORG,
  PERMISSIONS.CALLS_READ_OWN,
  PERMISSIONS.CALL_MAKE,
  PERMISSIONS.CALL_TRANSFER,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.SETTINGS_MANAGE,
];

const AUDITOR_PERMS = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.EXTENSIONS_READ,
  PERMISSIONS.CONTACTS_READ,
  PERMISSIONS.CALLS_READ_TEAM,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.ADMIN_AUDIT,
];

const SUPERVISOR_PERMS = [
  ...USER_PERMS,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.EXTENSIONS_READ,
  PERMISSIONS.CONTACTS_DELETE_ORG,
  PERMISSIONS.CALLS_READ_TEAM,
];

const ADMIN_PERMS = [
  ...SUPERVISOR_PERMS,
  PERMISSIONS.ORG_MANAGE,
  PERMISSIONS.USERS_CREATE,
  PERMISSIONS.USERS_UPDATE,
  PERMISSIONS.USERS_SUSPEND,
  PERMISSIONS.EXTENSIONS_MANAGE,
  PERMISSIONS.EXTENSIONS_REVOKE,
  PERMISSIONS.CALLS_EXPORT,
  PERMISSIONS.ADMIN_DASHBOARD,
  PERMISSIONS.ADMIN_AUDIT,
  PERMISSIONS.ADMIN_USAGE,
];

const OWNER_PERMS = [...new Set([...ADMIN_PERMS, PERMISSIONS.BILLING_READ, PERMISSIONS.BILLING_MANAGE])];

const PLATFORM_ADMIN_PERMS = [
  ...new Set([
    ...OWNER_PERMS,
    PERMISSIONS.USERS_SUSPEND,
    PERMISSIONS.EXTENSIONS_REVOKE,
    PERMISSIONS.ADMIN_DASHBOARD,
    PERMISSIONS.ADMIN_AUDIT,
    PERMISSIONS.ADMIN_USAGE,
  ]),
];

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.USER]: Object.freeze([...new Set(USER_PERMS)]),
  [ROLES.AUDITOR]: Object.freeze([...new Set(AUDITOR_PERMS)]),
  [ROLES.SUPERVISOR]: Object.freeze([...new Set(SUPERVISOR_PERMS)]),
  [ROLES.ADMIN]: Object.freeze([...new Set(ADMIN_PERMS)]),
  [ROLES.OWNER]: Object.freeze([...new Set(OWNER_PERMS)]),
  [ROLES.PLATFORM_ADMIN]: Object.freeze([...new Set(PLATFORM_ADMIN_PERMS)]),
});

/** Resolve the permission list for a role. Unknown roles get no permissions. */
export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(role, permission) {
  return permissionsForRole(role).includes(permission);
}

export function hasAllPermissions(role, permissions) {
  const granted = permissionsForRole(role);
  return permissions.every((p) => granted.includes(p));
}

export function hasAnyPermission(role, permissions) {
  const granted = permissionsForRole(role);
  return permissions.some((p) => granted.includes(p));
}
