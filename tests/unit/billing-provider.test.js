import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billingEnabled,
  planCatalogue,
  planById,
  createCheckoutSession,
} from "../../apps/api/lib/billing-provider.js";
import { ApiError } from "../../apps/api/lib/response.js";

function withEnv(vars, fn) {
  const previous = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("planCatalogue returns the expected plans", () => {
  const plans = planCatalogue();
  const ids = plans.map((p) => p.id).sort();
  assert.deepEqual(ids, ["pro", "standard", "trial"]);
  for (const plan of plans) {
    assert.equal(typeof plan.priceZar, "number");
    assert.equal(typeof plan.userLimit, "number");
    assert.equal(typeof plan.extensionLimit, "number");
  }
});

test("planById finds a plan and returns null otherwise", () => {
  assert.equal(planById("standard").name, "Standard");
  assert.equal(planById("does-not-exist"), null);
});

test("billingEnabled is false without a provider", () => {
  withEnv({ BILLING_PROVIDER: undefined }, () => {
    assert.equal(billingEnabled(), false);
  });
});

test("checkout throws BILLING_DISABLED when no provider is configured", async () => {
  await withEnv({ BILLING_PROVIDER: undefined }, async () => {
    await assert.rejects(
      () => createCheckoutSession({ organisationId: "o1", plan: "standard" }),
      (err) => err instanceof ApiError && err.code === "BILLING_DISABLED"
    );
  });
});

test("the mock provider returns deterministic checkout URLs", async () => {
  await withEnv(
    { BILLING_PROVIDER: "mock", APP_URL: "https://app.cloudtel.test" },
    async () => {
      assert.equal(billingEnabled(), true);
      const session = await createCheckoutSession({ organisationId: "o1", plan: "standard" });
      assert.match(session.url, /checkout=standard/);
      assert.match(session.url, /org=o1/);
      assert.ok(session.sessionId.startsWith("mock_cs_"));
    }
  );
});
