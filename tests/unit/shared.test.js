import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALL_DIRECTIONS,
  CALL_DISPOSITIONS,
  TELEPHONY_EVENTS,
  deriveDisposition,
  dispositionGroup,
  isValidId,
  dialableTarget,
  validateEmail,
  validatePassword,
  permissionsForRole,
  ROLES,
  PERMISSIONS,
} from "@cloudtel/shared";

test("deriveDisposition maps direction/answer to a disposition", () => {
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.OUTGOING, answered: true }),
    CALL_DISPOSITIONS.ANSWERED
  );
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.INCOMING, answered: false, terminatedBy: "remote" }),
    CALL_DISPOSITIONS.MISSED
  );
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.OUTGOING, answered: false, declined: true }),
    CALL_DISPOSITIONS.DECLINED
  );
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.OUTGOING, answered: false, busy: true }),
    CALL_DISPOSITIONS.BUSY
  );
});

test("deriveDisposition honours Asterisk hangup cause codes", () => {
  // 19 / 102: normal call clearing while unanswered.
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.INCOMING, answered: false, hangupCause: 19 }),
    CALL_DISPOSITIONS.NO_ANSWER
  );
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.OUTGOING, answered: false, hangupCause: 19 }),
    CALL_DISPOSITIONS.CANCELLED
  );
  // 16 / 31 / 21 depend on who terminated the call.
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.OUTGOING, answered: false, hangupCause: 16, terminatedBy: "local" }),
    CALL_DISPOSITIONS.CANCELLED
  );
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.INCOMING, answered: false, hangupCause: 16, terminatedBy: "remote" }),
    CALL_DISPOSITIONS.MISSED
  );
});

test("deriveDisposition handles voicemail and failure", () => {
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.INCOMING, answered: false, voicemail: true }),
    CALL_DISPOSITIONS.VOICEMAIL
  );
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.OUTGOING, answered: false, failed: true }),
    CALL_DISPOSITIONS.FAILED
  );
  // No distinguishing facts and no cause => failed.
  assert.equal(
    deriveDisposition({ direction: CALL_DIRECTIONS.INCOMING, answered: false }),
    CALL_DISPOSITIONS.FAILED
  );
});

test("dispositionGroup groups raw dispositions for the history filter", () => {
  assert.equal(dispositionGroup(CALL_DISPOSITIONS.ANSWERED), "answered");
  assert.equal(dispositionGroup(CALL_DISPOSITIONS.NO_ANSWER), "missed");
  assert.equal(dispositionGroup(CALL_DISPOSITIONS.CANCELLED), "cancelled");
});

test("TELEPHONY_EVENTS matches the webhook contract", () => {
  for (const event of [
    "call.started",
    "call.ringing",
    "call.answered",
    "call.held",
    "call.resumed",
    "call.ended",
    "call.failed",
    "registration.changed",
    "voicemail.deposited",
  ]) {
    assert.ok(TELEPHONY_EVENTS.includes(event), `missing ${event}`);
  }
});

test("isValidId accepts uuid-like ids and rejects junk", () => {
  assert.equal(isValidId("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isValidId("not an id!"), false);
  assert.equal(isValidId(""), false);
  assert.equal(isValidId(null), false);
});

test("dialableTarget normalises dial strings", () => {
  assert.equal(dialableTarget("1002"), "1002");
  assert.equal(dialableTarget("+27 82 123 4567"), "+27821234567");
  assert.equal(dialableTarget("!!!"), null);
});

test("validateEmail accepts valid and rejects invalid addresses", () => {
  assert.equal(validateEmail("owner@demo.cloudtel.test").valid, true);
  assert.equal(validateEmail("not-an-email").valid, false);
  assert.equal(validateEmail("").valid, false);
});

test("validatePassword enforces the policy", () => {
  assert.equal(validatePassword("CloudTel!Demo2026").valid, true);
  assert.equal(validatePassword("short").valid, false);
  assert.equal(validatePassword("").valid, false);
});

test("role permission sets are defined for every role", () => {
  for (const role of Object.values(ROLES)) {
    assert.ok(Array.isArray(permissionsForRole(role)), `${role} has no permissions`);
  }
});

test("user role cannot manage the organisation", () => {
  assert.equal(permissionsForRole(ROLES.USER).includes(PERMISSIONS.ORG_MANAGE), false);
  assert.equal(permissionsForRole(ROLES.OWNER).includes(PERMISSIONS.ORG_MANAGE), true);
});
