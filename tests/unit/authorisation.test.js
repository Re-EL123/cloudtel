import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveRole,
  contextCan,
  requirePermission,
  requireOrganisation,
  assertOutranks,
} from "../../apps/api/lib/authorisation.js";
import { PERMISSIONS, ROLES, permissionsForRole } from "@cloudtel/shared";
import { ApiError } from "../../apps/api/lib/response.js";

function context(role, { isPlatformAdmin = false, organisationId = "org-1" } = {}) {
  return { role, isPlatformAdmin, organisationId, user: { id: "u1" } };
}

test("effectiveRole returns the context role", () => {
  assert.equal(effectiveRole(context(ROLES.ADMIN)), ROLES.ADMIN);
});

test("platform admins are elevated regardless of membership role", () => {
  assert.equal(effectiveRole(context(ROLES.USER, { isPlatformAdmin: true })), ROLES.PLATFORM_ADMIN);
});

test("contextCan reflects the role permission set", () => {
  assert.equal(contextCan(context(ROLES.OWNER), PERMISSIONS.ORG_MANAGE), true);
  assert.equal(contextCan(context(ROLES.USER), PERMISSIONS.ORG_MANAGE), false);
  assert.equal(contextCan(context(ROLES.AUDITOR), PERMISSIONS.ORG_MANAGE), false);
});

test("contextCan returns false when no role is present", () => {
  assert.equal(contextCan({}, PERMISSIONS.ORG_READ), false);
});

test("requirePermission throws FORBIDDEN for a lower role and passes otherwise", () => {
  assert.throws(
    () => requirePermission(context(ROLES.USER), PERMISSIONS.ORG_MANAGE),
    (err) => err instanceof ApiError && err.status === 403 && err.code === "FORBIDDEN"
  );
  assert.equal(requirePermission(context(ROLES.OWNER), PERMISSIONS.ORG_MANAGE), true);
});

test("requireOrganisation returns the id or throws FORBIDDEN", () => {
  assert.equal(requireOrganisation(context(ROLES.USER)), "org-1");
  assert.throws(
    () => requireOrganisation({ organisationId: null }),
    (err) => err instanceof ApiError && err.status === 403
  );
});

test("assertOutranks permits acting on strictly lower roles", () => {
  assert.equal(assertOutranks(ROLES.OWNER, ROLES.ADMIN), true);
  assert.equal(assertOutranks(ROLES.ADMIN, ROLES.USER), true);
});

test("assertOutranks forbids acting on equal or higher roles", () => {
  assert.throws(
    () => assertOutranks(ROLES.ADMIN, ROLES.ADMIN),
    (err) => err instanceof ApiError && err.status === 403
  );
  assert.throws(
    () => assertOutranks(ROLES.ADMIN, ROLES.OWNER),
    (err) => err instanceof ApiError && err.status === 403
  );
});

test("permission sets are monotonic by role rank", () => {
  const count = (role) => permissionsForRole(role).length;
  assert.ok(count(ROLES.USER) <= count(ROLES.SUPERVISOR));
  assert.ok(count(ROLES.SUPERVISOR) <= count(ROLES.ADMIN));
  assert.ok(count(ROLES.ADMIN) <= count(ROLES.OWNER));
  assert.equal(count(ROLES.PLATFORM_ADMIN), count(ROLES.OWNER));
});

test("every permission is scoped with a colon namespace", () => {
  for (const value of Object.values(PERMISSIONS)) {
    assert.match(value, /^[a-z_]+(:[a-z_]+)+$/);
  }
});
