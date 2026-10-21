/**
 * Serverless function 10: Webhooks
 * POST /api/v1/webhooks/telephony
 * POST /api/v1/webhooks/billing
 *
 * Events are authenticated with an HMAC signature, rejected outside a
 * 5-minute replay window, deduplicated by event id, and processed
 * idempotently (§9.2 function 10).
 */
import {
  CALL_DIRECTIONS,
  TELEPHONY_EVENTS,
  deriveDisposition,
  isValidId,
} from "@cloudtel/shared";
import { accepted, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query, withTransaction } from "../../../lib/database.js";
import { audit } from "../../../lib/audit.js";
import { verifyWebhookSignature } from "../../../lib/webhook-signature.js";

/** Resolve the tenant for an event: explicit id, else extension number. */
async function resolveOrganisation(event) {
  if (event.organisationId && isValidId(event.organisationId)) {
    const org = await query(`SELECT id FROM organisations WHERE id = $1 AND status = 'active'`, [
      event.organisationId,
    ]);
    if (org.rows[0]) return org.rows[0].id;
  }
  if (event.extension) {
    const ext = await query(
      `SELECT organisation_id FROM extensions WHERE number = $1 AND status = 'active' ORDER BY created_at LIMIT 1`,
      [String(event.extension)]
    );
    if (ext.rows[0]) return ext.rows[0].organisation_id;
  }
  return null;
}

async function resolveExtension(organisationId, number) {
  if (!number) return null;
  const { rows } = await query(
    `SELECT id, user_id FROM extensions WHERE organisation_id = $1 AND number = $2 AND status <> 'revoked'`,
    [organisationId, String(number)]
  );
  return rows[0] || null;
}

function eventTime(event) {
  const value = event.occurredAt || event.time || new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function findCallRecord(client, organisationId, providerCallId) {
  const { rows } = await client.query(
    `SELECT * FROM call_records WHERE organisation_id = $1 AND provider_call_id = $2`,
    [organisationId, providerCallId]
  );
  return rows[0] || null;
}

async function upsertStartedCall(client, organisationId, event, occurredAt) {
  const existing = await findCallRecord(client, organisationId, event.callId);
  if (existing) return existing;

  const extension = await resolveExtension(organisationId, event.extension || event.calleeNumber);
  const { rows } = await client.query(
    `INSERT INTO call_records (
       organisation_id, user_id, extension_id, provider_call_id, direction,
       caller_number, callee_number, caller_name, started_at, disposition, source
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'failed', 'pbx')
     ON CONFLICT (organisation_id, provider_call_id) WHERE provider_call_id IS NOT NULL
     DO UPDATE SET updated_at = now()
     RETURNING *`,
    [
      organisationId,
      event.userId || extension?.user_id || null,
      extension?.id || null,
      event.callId,
      event.direction === CALL_DIRECTIONS.INCOMING ? CALL_DIRECTIONS.INCOMING : CALL_DIRECTIONS.OUTGOING,
      String(event.callerNumber || "").slice(0, 32),
      String(event.calleeNumber || "").slice(0, 32),
      String(event.callerName || "").slice(0, 120),
      event.startedAt ? new Date(event.startedAt) : occurredAt,
    ]
  );
  return rows[0];
}

async function applyCallEnded(client, organisationId, event, occurredAt) {
  const record = await upsertStartedCall(client, organisationId, event, occurredAt);
  const endedAt = event.endedAt ? new Date(event.endedAt) : occurredAt;
  const answeredAt = record.answered_at || (event.answeredAt ? new Date(event.answeredAt) : null);
  const startedAt = new Date(record.started_at);
  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
  );
  const billableSeconds =
    event.billableSeconds !== undefined && event.billableSeconds !== null
      ? Math.max(0, Number(event.billableSeconds))
      : durationSeconds;

  const disposition = deriveDisposition({
    direction: record.direction,
    answered: Boolean(answeredAt),
    hangupCause: event.hangupCause,
    terminatedBy: event.terminatedBy,
    declined: Boolean(event.declined),
    busy: Boolean(event.busy),
    voicemail: Boolean(event.voicemail),
    failed: Boolean(event.failed),
  });

  const { rows } = await client.query(
    `UPDATE call_records
        SET answered_at = $2,
            ended_at = $3,
            duration_seconds = $4,
            billable_seconds = $5,
            disposition = $6,
            hangup_cause = $7,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      record.id,
      answeredAt,
      endedAt,
      durationSeconds,
      billableSeconds,
      disposition,
      event.hangupCause !== undefined && event.hangupCause !== null ? String(event.hangupCause) : record.hangup_cause,
    ]
  );
  const updated = rows[0];

  // Usage rows are the billing source of truth; never the browser timer.
  for (const [metric, quantity, unit] of [
    ["call_seconds", durationSeconds, "seconds"],
    ["billable_seconds", billableSeconds, "seconds"],
    ["calls_count", 1, "count"],
  ]) {
    await client.query(
      `INSERT INTO usage_records (organisation_id, user_id, extension_id, call_record_id, metric, quantity, unit, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organisation_id, call_record_id, metric)
       DO UPDATE SET quantity = EXCLUDED.quantity, occurred_at = EXCLUDED.occurred_at`,
      [
        organisationId,
        updated.user_id,
        updated.extension_id,
        updated.id,
        metric,
        quantity,
        unit,
        endedAt,
      ]
    );
  }
  return updated;
}

async function processTelephonyEvent(client, organisationId, event, occurredAt) {
  switch (event.type) {
    case "call.started":
    case "call.ringing":
      return upsertStartedCall(client, organisationId, event, occurredAt);
    case "call.answered": {
      const record = await upsertStartedCall(client, organisationId, event, occurredAt);
      const { rows } = await client.query(
        `UPDATE call_records
            SET answered_at = COALESCE(answered_at, $2), disposition = 'answered', updated_at = now()
          WHERE id = $1 RETURNING *`,
        [record.id, event.answeredAt ? new Date(event.answeredAt) : occurredAt]
      );
      return rows[0];
    }
    case "call.held":
    case "call.resumed":
      return upsertStartedCall(client, organisationId, event, occurredAt);
    case "call.ended":
    case "call.failed":
      return applyCallEnded(client, organisationId, {
        ...event,
        failed: event.type === "call.failed" ? true : event.failed,
      }, occurredAt);
    case "voicemail.deposited": {
      const record = await upsertStartedCall(client, organisationId, event, occurredAt);
      const endedAt = event.endedAt ? new Date(event.endedAt) : occurredAt;
      const durationSeconds = Math.max(
        0,
        Math.round((endedAt.getTime() - new Date(record.started_at).getTime()) / 1000)
      );
      const { rows } = await client.query(
        `UPDATE call_records
            SET answered_at = COALESCE(answered_at, $2),
                ended_at = $3,
                duration_seconds = $4,
                billable_seconds = $4,
                disposition = 'voicemail',
                updated_at = now()
          WHERE id = $1 RETURNING *`,
        [record.id, record.answered_at || occurredAt, endedAt, durationSeconds]
      );
      return rows[0];
    }
    case "registration.changed":
      return null;
    default:
      return null;
  }
}

const routes = [
  {
    method: "POST",
    path: "/webhooks/telephony",
    auth: "webhook",
    rateLimit: { windowMs: 60 * 1000, max: 1200 },
    handle: async (ctx) => {
      const { eventId } = verifyWebhookSignature({
        rawBody: ctx.rawBody,
        headers: ctx.req.headers,
        secret: process.env.TELEPHONY_WEBHOOK_SECRET,
      });

      const event = ctx.body || {};
      if (!event.type || !TELEPHONY_EVENTS.includes(event.type)) {
        accepted(ctx.res, { received: true, ignored: true, reason: "Unsupported event type." }, {
          requestId: ctx.requestId,
        });
        return;
      }
      if (!event.callId && event.type !== "registration.changed") {
        throw new ApiError(422, "VALIDATION_ERROR", "callId is required for call events.");
      }

      const organisationId = await resolveOrganisation(event);
      if (!organisationId) {
        throw new ApiError(422, "VALIDATION_ERROR", "Unable to resolve the organisation for this event.");
      }

      const providerEventId = eventId || event.eventId || event.callId || "";
      const occurredAt = eventTime(event);

      let result;
      try {
        result = await withTransaction(async (client) => {
          // Event-level deduplication (idempotency).
          const inserted = await client.query(
            `INSERT INTO call_events (organisation_id, provider_call_id, event_type, payload, occurred_at, processed)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (organisation_id, provider_call_id, event_type, occurred_at) DO NOTHING
             RETURNING id`,
            [organisationId, event.callId || "registration", event.type, JSON.stringify(event), occurredAt]
          );
          if (inserted.rows.length === 0) {
            return { duplicate: true };
          }
          const record = await processTelephonyEvent(client, organisationId, event, occurredAt);
          await client.query(
            `UPDATE call_events SET call_record_id = $2 WHERE id = $1`,
            [inserted.rows[0].id, record?.id || null]
          );
          return { duplicate: false, callId: record?.id || null };
        });
      } catch (err) {
        console.error("webhook:telephony-processing-failed", { message: err?.message, type: event.type });
        throw new ApiError(500, "INTERNAL_ERROR", "Event processing failed; the sender should retry.");
      }

      if (result.duplicate) {
        accepted(ctx.res, { received: true, duplicate: true }, { requestId: ctx.requestId });
        return;
      }

      // Record webhook delivery for audit/observability (best effort).
      try {
        await query(
          `INSERT INTO webhook_events (source, provider_event_id, event_type, organisation_id, status, attempts, payload, processed_at)
           VALUES ('telephony', $1, $2, $3, 'processed', 1, $4, now())
           ON CONFLICT (source, provider_event_id) DO NOTHING`,
          [providerEventId, event.type, organisationId, JSON.stringify(event).slice(0, 10000)]
        );
      } catch {
        /* non-critical */
      }

      await audit({
        organisationId,
        action: "webhook.telephony_event",
        resourceType: "call_event",
        resourceId: String(event.callId || "").slice(0, 64),
        metadata: { type: event.type, providerEventId },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });

      accepted(ctx.res, { received: true, processed: event.type, callId: result.callId }, {
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "POST",
    path: "/webhooks/billing",
    auth: "webhook",
    rateLimit: { windowMs: 60 * 1000, max: 600 },
    handle: async (ctx) => {
      const { eventId } = verifyWebhookSignature({
        rawBody: ctx.rawBody,
        headers: ctx.req.headers,
        secret: process.env.BILLING_WEBHOOK_SECRET,
      });

      const event = ctx.body || {};
      const providerEventId = eventId || event.eventId || "";
      if (!providerEventId) {
        throw new ApiError(422, "VALIDATION_ERROR", "An event id is required.");
      }

      const organisationId = event.organisationId && isValidId(event.organisationId) ? event.organisationId : null;

      // Dedupe first: billing events must never be applied twice.
      const inserted = await query(
        `INSERT INTO webhook_events (source, provider_event_id, event_type, organisation_id, status, attempts, payload)
         VALUES ('billing', $1, $2, $3, 'received', 1, $4)
         ON CONFLICT (source, provider_event_id) DO NOTHING
         RETURNING id`,
        [providerEventId, String(event.type || "unknown").slice(0, 64), organisationId, JSON.stringify(event).slice(0, 10000)]
      );
      if (inserted.rows.length === 0) {
        accepted(ctx.res, { received: true, duplicate: true }, { requestId: ctx.requestId });
        return;
      }

      if (!organisationId) {
        await query(`UPDATE webhook_events SET status = 'rejected', error = $2 WHERE id = $1`, [
          inserted.rows[0].id,
          "Missing organisationId",
        ]);
        throw new ApiError(422, "VALIDATION_ERROR", "organisationId is required for billing events.");
      }

      try {
        if (event.type === "subscription.created" || event.type === "subscription.updated") {
          await query(
            `INSERT INTO subscriptions (organisation_id, plan, status, provider_customer_id, period_start, period_end)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (organisation_id) DO UPDATE
               SET plan = EXCLUDED.plan,
                   status = EXCLUDED.status,
                   provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, subscriptions.provider_customer_id),
                   period_start = EXCLUDED.period_start,
                   period_end = EXCLUDED.period_end,
                   updated_at = now()`,
            [
              organisationId,
              String(event.plan || "standard").slice(0, 40),
              ["active", "past_due", "cancelled", "trialing"].includes(event.status) ? event.status : "active",
              event.customerId || null,
              event.periodStart ? new Date(event.periodStart) : null,
              event.periodEnd ? new Date(event.periodEnd) : null,
            ]
          );
        } else if (event.type === "subscription.cancelled") {
          await query(
            `UPDATE subscriptions SET status = 'cancelled', cancelled_at = now(), updated_at = now()
              WHERE organisation_id = $1`,
            [organisationId]
          );
        }

        await query(`UPDATE webhook_events SET status = 'processed', processed_at = now() WHERE id = $1`, [
          inserted.rows[0].id,
        ]);
        await audit({
          organisationId,
          action: "webhook.billing_event",
          resourceType: "billing",
          resourceId: providerEventId.slice(0, 64),
          metadata: { type: event.type },
          ip: ctx.ip,
          requestId: ctx.requestId,
        });
      } catch (err) {
        await query(`UPDATE webhook_events SET status = 'failed', error = $2 WHERE id = $1`, [
          inserted.rows[0].id,
          String(err?.message || "processing failed").slice(0, 500),
        ]);
        throw new ApiError(500, "INTERNAL_ERROR", "Event processing failed; the sender should retry.");
      }

      accepted(ctx.res, { received: true, processed: event.type }, { requestId: ctx.requestId });
    },
  },
];

export default createHandler(routes);
