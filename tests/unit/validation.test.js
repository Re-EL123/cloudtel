import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requireString,
  optionalString,
  optionalBoolean,
  optionalInteger,
  optionalEnum,
  requireId,
  assertValid,
} from "../../apps/api/lib/validation.js";
import { ApiError } from "../../apps/api/lib/response.js";

test("requireString trims and returns a value", () => {
  assert.equal(requireString({ name: "  Alice  " }, "name"), "Alice");
});

test("requireString rejects missing, empty and non-string values", () => {
  for (const body of [{}, { name: "" }, { name: "   " }, { name: 5 }, { name: null }]) {
    assert.throws(() => requireString(body, "name"), (err) => err instanceof ApiError && err.status === 422);
  }
});

test("requireString enforces max length", () => {
  assert.throws(() => requireString({ s: "x".repeat(6) }, "s", { max: 5 }), /too long|invalid/i);
});

test("optionalString returns '' by default and undefined when not allowEmpty", () => {
  assert.equal(optionalString({}, "x"), "");
  assert.equal(optionalString({}, "x", { allowEmpty: false }), undefined);
  assert.equal(optionalString({ x: "" }, "x"), "");
  assert.equal(optionalString({ x: null }, "x"), "");
  assert.equal(optionalString({ x: " hi " }, "x"), "hi");
});

test("optionalString rejects a non-string value", () => {
  assert.throws(
    () => optionalString({ x: 5 }, "x"),
    (err) => err instanceof ApiError && err.status === 422
  );
});

test("optionalString enforces max length", () => {
  assert.throws(
    () => optionalString({ x: "x".repeat(6) }, "x", { max: 5 }),
    (err) => err instanceof ApiError && err.status === 422
  );
});

test("optionalBoolean accepts booleans and applies a fallback", () => {
  assert.equal(optionalBoolean({ b: true }, "b"), true);
  assert.equal(optionalBoolean({ b: false }, "b"), false);
  assert.equal(optionalBoolean({}, "b", true), true);
  assert.equal(optionalBoolean({}, "b"), undefined);
});

test("optionalBoolean rejects non-boolean values", () => {
  assert.throws(
    () => optionalBoolean({ b: "true" }, "b"),
    (err) => err instanceof ApiError && err.status === 422
  );
});

test("optionalInteger enforces bounds", () => {
  assert.equal(optionalInteger({ n: 5 }, "n", { min: 0, max: 10 }), 5);
  assert.equal(optionalInteger({ n: "7" }, "n", { min: 0, max: 10 }), 7);
  assert.throws(() => optionalInteger({ n: 11 }, "n", { min: 0, max: 10 }), /between|invalid/i);
  assert.throws(() => optionalInteger({ n: -1 }, "n", { min: 0, max: 10 }));
  assert.equal(optionalInteger({}, "n", { min: 0, max: 10, fallback: 3 }), 3);
});

test("optionalEnum only accepts listed values", () => {
  assert.equal(optionalEnum({ e: "yes" }, "e", ["yes", "no"]), "yes");
  assert.equal(optionalEnum({}, "e", ["yes", "no"], "no"), "no");
  assert.throws(() => optionalEnum({ e: "maybe" }, "e", ["yes", "no"]));
});

test("requireId returns the value or throws a 404", () => {
  assert.equal(requireId("abc"), "abc");
  assert.throws(
    () => requireId(""),
    (err) => err instanceof ApiError && err.status === 404 && err.code === "NOT_FOUND"
  );
});

test("assertValid throws on invalid and returns on valid", () => {
  assert.equal(assertValid({ valid: true, value: 42 }), 42);
  assert.equal(assertValid({ valid: true }), true);
  assert.throws(
    () => assertValid({ valid: false, error: "bad" }),
    (err) => err instanceof ApiError && err.status === 422
  );
});
