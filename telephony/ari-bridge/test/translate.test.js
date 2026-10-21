import { test } from "node:test";
import assert from "node:assert/strict";
import { translateAriEvent, voicemailDeposited } from "../src/translate.js";

const config = { organisationId: "org-1" };

function channel(overrides = {}) {
  return {
    id: "ch-1",
    name: "PJSIP/1001-00000001",
    state: "Up",
    caller: { number: "1001", name: "Alice" },
    connected: { number: "1002" },
    dialplan: { exten: "1001", app_data: "" },
    ...overrides,
  };
}

test("callerNumber is spelled correctly in StasisStart output", () => {
  const out = translateAriEvent({ type: "StasisStart", timestamp: "2026-01-01T00:00:00Z", channel: channel() }, { config });
  assert.equal(out.type, "call.started");
  assert.equal(out.callerNumber, "1001");
  assert.equal(out.calleeNumber, "1002");
  assert.equal(out.direction, "incoming");
});

test("outbound StasisStart is marked outgoing", () => {
  const out = translateAriEvent(
    { type: "StasisStart", timestamp: "2026-01-01T00:00:00Z", channel: channel({ dialplan: { app_data: "outbound" } }) },
    { config }
  );
  assert.equal(out.direction, "outgoing");
});

test("ChannelStateChange Up maps to call.answered", () => {
  const out = translateAriEvent(
    { type: "ChannelStateChange", channel: channel({ state: "Up" }) },
    { config }
  );
  assert.equal(out.type, "call.answered");
  assert.ok(out.answeredAt);
});

test("ChannelStateChange Ringing maps to call.ringing", () => {
  const out = translateAriEvent({ type: "ChannelStateChange", channel: channel({ state: "Ringing" }) }, { config });
  assert.equal(out.type, "call.ringing");
});

test("ChannelDestroyed maps to call.ended with hangup cause", () => {
  const out = translateAriEvent(
    { type: "ChannelDestroyed", channel: channel({ state: "Up", hangupCause: "NORMAL_CLEARING" }) },
    { config }
  );
  assert.equal(out.type, "call.ended");
  assert.equal(out.hangupCause, "NORMAL_CLEARING");
  assert.equal(out.failed, false);
});

test("ChannelDestroyed with failure cause flags failed", () => {
  const out = translateAriEvent(
    { type: "ChannelDestroyed", channel: channel({ hangupCause: "CONGESTION" }) },
    { config }
  );
  assert.equal(out.failed, true);
});

test("held bridge state maps to call.held", () => {
  const out = translateAriEvent(
    { type: "BridgeCreated", bridge: { state: "held" }, channel: channel() },
    { config }
  );
  assert.equal(out.type, "call.held");
});

test("ContactStatusChange maps to registration.changed", () => {
  const out = translateAriEvent(
    { type: "ContactStatusChange", endpoint: { resource: "1001", state: "online" } },
    { config }
  );
  assert.equal(out.type, "registration.changed");
  assert.equal(out.registered, true);
  assert.equal(out.extension, "1001");
});

test("unknown event returns null", () => {
  assert.equal(translateAriEvent({ type: "SomethingElse" }, { config }), null);
  assert.equal(translateAriEvent(null, { config }), null);
});

test("voicemailDeposited builds a voicemail payload", () => {
  const out = voicemailDeposited({
    callId: "ch-1",
    extension: "1001",
    recordingName: "vm-1001-1.wav",
    durationSeconds: 12,
    config: { organisationId: "org-1", recordingBaseUrl: "https://cdn.example/rec" },
  });
  assert.equal(out.type, "voicemail.deposited");
  assert.equal(out.recordingUrl, "https://cdn.example/rec/vm-1001-1.wav");
});
