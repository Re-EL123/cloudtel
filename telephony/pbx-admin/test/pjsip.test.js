import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSipPassword, isValidNumber, renderPjsipInclude, sanitiseDisplayName } from "../src/pjsip.js";

test("validates extension numbers", () => {
  assert.equal(isValidNumber("1001"), true);
  assert.equal(isValidNumber("12"), true);
  assert.equal(isValidNumber("1"), false);
  assert.equal(isValidNumber("12x"), false);
  assert.equal(isValidNumber("1234567890123"), false);
});

test("generates unique URL-safe SIP secrets", () => {
  const a = generateSipPassword();
  const b = generateSipPassword();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{40,}$/);
});

test("sanitises display names", () => {
  assert.equal(sanitiseDisplayName('Alice\n"Admin"\\'), "Alice Admin");
  assert.equal(sanitiseDisplayName("   "), "");
  assert.equal(sanitiseDisplayName("a".repeat(200)).length, 120);
});

test("renders endpoint, aor and auth blocks for enabled extensions", () => {
  const output = renderPjsipInclude(
    [
      { number: "1002", displayName: "Bob", password: "secret2", enabled: true },
      { number: "1001", displayName: "Alice", password: "secret1", enabled: true },
      { number: "1003", displayName: "Disabled", password: "secret3", enabled: false },
    ],
    { context: "cloudtel-internal" }
  );
  assert.match(output, /\[1001\]\(webrtc-endpoint\)/);
  assert.match(output, /\[1001\]\(aor-template\)/);
  assert.match(output, /\[auth1001\]\(auth-template\)/);
  assert.match(output, /password = secret1/);
  assert.match(output, /callerid = "Alice" <1001>/);
  assert.ok(output.indexOf("[1001]") < output.indexOf("[1002]"));
  assert.doesNotMatch(output, /1003/);
});

test("skips invalid and duplicate numbers", () => {
  const output = renderPjsipInclude([
    { number: "1001", password: "a" },
    { number: "1001", password: "b" },
    { number: "bad", password: "c" },
  ]);
  assert.equal(output.match(/\[1001\]\(webrtc-endpoint\)/g).length, 1);
  assert.match(output, /password = a/);
});
