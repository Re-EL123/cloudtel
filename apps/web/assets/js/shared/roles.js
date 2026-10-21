/**
 * CloudTel role model.
 * A user's effective role is their membership role inside the organisation
 * currently selected. Platform administrators act across organisations.
 */
import { MEMBER_ROLES } from "./constants.js";

export const ROLES = Object.freeze({
  PLATFORM_ADMIN: "platform_admin",
  OWNER: MEMBER_ROLES.OWNER,
  ADMIN: MEMBER_ROLES.ADMIN,
  SUPERVISOR: MEMBER_ROLES.SUPERVISOR,
  USER: MEMBER_ROLES.USER,
  AUDITOR: MEMBER_ROLES.AUDITOR,
});

export const ROLE_LIST = Object.freeze(Object.values(ROLES));

/** Higher number = more authority. Used for "cannot manage a peer/superior" checks. */
export const ROLE_RANK = Object.freeze({
  [ROLES.USER]: 10,
  [ROLES.AUDITOR]: 10,
  [ROLES.SUPERVISOR]: 20,
  [ROLES.ADMIN]: 30,
  [ROLES.OWNER]: 40,
  [ROLES.PLATFORM_ADMIN]: 50,
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.PLATFORM_ADMIN]: "Platform administrator",
  [ROLES.OWNER]: "Organisation owner",
  [ROLES.ADMIN]: "Organisation administrator",
  [ROLES.SUPERVISOR]: "Supervisor",
  [ROLES.USER]: "Standard user",
  [ROLES.AUDITOR]: "Read-only auditor",
});

export function isKnownRole(role) {
  return ROLE_LIST.includes(role);
}

export function roleRank(role) {
  return ROLE_RANK[role] ?? 0;
}

export function atLeast(role, minimum) {
  return roleRank(role) >= roleRank(minimum);
}
