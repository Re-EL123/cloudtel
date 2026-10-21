/**
 * Billing provider adapter.
 * Billing stays disabled until a provider is configured (spec §9.2 function 11).
 * Providers:
 *   - "none"/unset: every billing operation reports BILLING_DISABLED.
 *   - "mock": deterministic behaviour for development and automated tests.
 *   - anything else: reserved for a real integration (e.g. Stripe) - implement
 *     createCheckoutSession/createPortalSession against the vendor API and keep
 *     secrets in environment variables only.
 */
import { ApiError } from "./response.js";

const MOCK_PLANS = {
  trial: { id: "trial", name: "Trial", priceZar: 0, userLimit: 5, extensionLimit: 5, concurrentCallLimit: 2 },
  standard: { id: "standard", name: "Standard", priceZar: 149, userLimit: 25, extensionLimit: 25, concurrentCallLimit: 10 },
  pro: { id: "pro", name: "Pro", priceZar: 399, userLimit: 100, extensionLimit: 100, concurrentCallLimit: 40 },
};

export function billingEnabled() {
  return Boolean(process.env.BILLING_PROVIDER);
}

function requireEnabled() {
  if (!billingEnabled()) {
    throw new ApiError(503, "BILLING_DISABLED", "Billing is not enabled for this account yet.");
  }
}

function getProvider() {
  const name = process.env.BILLING_PROVIDER;
  if (!name) return null;
  if (name === "mock") {
    return {
      name: "mock",
      async createCheckoutSession({ organisationId, plan, successUrl, cancelUrl }) {
        return {
          url: `${process.env.APP_URL || "http://localhost:3000"}/settings?checkout=${plan}&org=${organisationId}`,
          sessionId: `mock_cs_${organisationId}_${plan}`,
          successUrl,
          cancelUrl,
        };
      },
      async createPortalSession({ organisationId, returnUrl }) {
        return {
          url: `${process.env.APP_URL || "http://localhost:3000"}/settings?portal=1&org=${organisationId}`,
          sessionId: `mock_bp_${organisationId}`,
          returnUrl,
        };
      },
    };
  }
  console.warn(`billing: provider "${name}" has no adapter installed; billing endpoints stay disabled`);
  return null;
}

export function planCatalogue() {
  return Object.values(MOCK_PLANS);
}

export function planById(planId) {
  return MOCK_PLANS[planId] || null;
}

export async function createCheckoutSession(params) {
  requireEnabled();
  const provider = getProvider();
  if (!provider) throw new ApiError(503, "BILLING_DISABLED", "Billing is not enabled for this account yet.");
  return provider.createCheckoutSession(params);
}

export async function createPortalSession(params) {
  requireEnabled();
  const provider = getProvider();
  if (!provider) throw new ApiError(503, "BILLING_DISABLED", "Billing is not enabled for this account yet.");
  return provider.createPortalSession(params);
}
