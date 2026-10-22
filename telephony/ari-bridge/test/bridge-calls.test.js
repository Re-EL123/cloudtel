import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { attachCallRouting } from "../src/bridge-calls.js";

function fakeClient() {
  const calls = [];
  const bridge = {
    id: "b1",
    addChannel: async (p) => calls.push(["addChannel", p.channel]),
    delete: async () => calls.push(["bridgeDelete"]),
  };
  const client = new EventEmitter();
  client.bridges = { create: async () => bridge };
  client.channels = {
    ring: async (p) => calls.push(["ring", p.channelId]),
    ringStop: async (p) => calls.push(["ringStop", p.channelId]),
    answer: async (p) => calls.push(["answer", p.channelId]),
    hangup: async (p) => calls.push(["hangup", p.channelId]),
    originate: async (p) => {
      calls.push(["originate", p.endpoint, p.appArgs]);
      return {};
    },
  };
  return { client, calls };
}

const tick = () => new Promise((r) => setImmediate(r));

test("rings the caller, originates the callee and bridges on answer", async () => {
  const { client, calls } = fakeClient();
  attachCallRouting(client, { logger: { warn() {}, error() {}, log() {} } });

  client.emit("StasisStart", { args: ["internal", "1002"] }, { id: "c1", caller: { number: "1001" } });
  await tick();
  assert.deepEqual(calls[0], ["ring", "c1"]);
  assert.deepEqual(calls[1], ["originate", "PJSIP/1002", "internal-callee,c1"]);

  client.emit("StasisStart", { args: ["internal-callee", "c1"] }, { id: "c2" });
  await tick();

  client.emit("ChannelStateChange", {}, { id: "c2", state: "Up" });
  await tick();
  assert.deepEqual(calls.at(-4), ["ringStop", "c1"]);
  assert.deepEqual(calls.at(-3), ["answer", "c1"]);
  assert.deepEqual(calls.at(-2), ["addChannel", "c1"]);
  assert.deepEqual(calls.at(-1), ["addChannel", "c2"]);
});

test("hangs up the callee when the caller disappears", async () => {
  const { client, calls } = fakeClient();
  attachCallRouting(client, { logger: { warn() {}, error() {}, log() {} } });

  client.emit("StasisStart", { args: ["internal", "1002"] }, { id: "c1", caller: {} });
  await tick();
  client.emit("StasisStart", { args: ["internal-callee", "c1"] }, { id: "c2" });
  await tick();
  client.emit("ChannelDestroyed", {}, { id: "c1" });
  await tick();
  assert.ok(calls.some((c) => c[0] === "hangup" && c[1] === "c2"));
  assert.ok(calls.some((c) => c[0] === "bridgeDelete"));
});

test("rejects invalid extension numbers", async () => {
  const { client, calls } = fakeClient();
  attachCallRouting(client, { logger: { warn() {}, error() {}, log() {} } });
  client.emit("StasisStart", { args: ["internal", "not-a-number"] }, { id: "c1" });
  await tick();
  assert.deepEqual(calls, [["hangup", "c1"]]);
});
