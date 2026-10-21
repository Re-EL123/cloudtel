/**
 * Serverless function 11: Billing
 * GET  /api/v1/billing/plan
 * GET  /api/v1/billing/usage
 * POST /api/v1/billing/checkout
 * POST /api/v1/billing/portal
 *
 * Billing remains disabled until a provider is configured. The browser can
 * never assert usage amounts or subscription status (§9.2 function 11).
 */
import { success, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import { PERMISSIONS, requireOrganisation } from "../../../lib/authorisation.js";
import { audit } from "../../../lib/audit.js";
import { requireString } from "../../../lib/validation.js";
import {
  billingEnabled,
  createCheckoutSession,
  createPortalSession,
  planById,
  planCatalogue,
} from "../../../lib/billing-provider.js";

const routes = [
  {
    method: "GET",
    path: "/billing/plan",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(`SELECT * FROM subscriptions WHERE organisation_id = $1`, [organisationId]);
      const subscription = rows[0] || null;
      success(
        ctx.res,
        {
          enabled: billingEnabled(),
          current: subscription
            ? {
                plan: subscription.plan,
                status: subscription.status,
                limits: subscription.limits || {},
                periodStart: subscription.period_start,
                periodEnd: subscription.period_end,
                cancelledAt: subscription.cancelled_at,
              }
            : { plan: "trial", status: "active", limits: {} },
          catalogue: planCatalogue(),
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "GET",
    path: "/billing/usage",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(
        `SELECT metric, sum(quantity) AS total
           FROM usage_records
          WHERE organisation_id = $1
            AND occurred_at >= date_trunc('month', now())
          GROUP BY metric`,
        [organisationId]
      );
      const calls = await query(
        `SELECT count(*)::int AS calls, COALESCE(sum(duration_seconds), 0)::int AS seconds
           FROM call_records
          WHERE organisation_id = $1 AND started_at >= date_trunc('month', now())`,
        [organisationId]
      );
      const byMetric = Object.fromEntries(rows.map((r) => [r.metric, Number(r.total)]));
      success(
        ctx.res,
        {
          enabled: billingEnabled(),
          periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
          metrics: {
            callsCount: byMetric.calls_count ?? calls.rows[0].calls,
            callSeconds: byMetric.call_seconds ?? calls.rows[0].seconds,
            billableSeconds: byMetric.billable_seconds ?? 0,
          },
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "POST",
    path: "/billing/checkout",
    auth: "session",
    permission: PERMISSIONS.BILLING_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const plan = requireString(ctx.body, "plan", { max: 40 });
      if (!planById(plan)) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          plan: "Unknown plan.",
        });
      }
      const session = await createCheckoutSession({
        organisationId,
        plan,
        successUrl: `${process.env.APP_URL || ""}/settings?billing=success`,
        cancelUrl: `${process.env.APP_URL || ""}/settings?billing=cancelled`,
      });
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "billing.checkout_initiated",
        resourceType: "subscription",
        resourceId: organisationId,
        metadata: { plan, sessionId: session.sessionId },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { url: session.url, sessionId: session.sessionId }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/billing/portal",
    auth: "session",
    permission: PERMISSIONS.BILLING_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const session = await createPortalSession({
        organisationId,
        returnUrl: `${process.env.APP_URL || ""}/settings`,
      });
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "billing.portal_opened",
        resourceType: "subscription",
        resourceId: organisationId,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { url: session.url, sessionId: session.sessionId }, { requestId: ctx.requestId });
    },
  },
];

export default createHandler(routes);
