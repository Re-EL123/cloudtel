/**
 * Serverless function 7: Call control
 * POST /api/v1/call-control/:callId/answer
 * POST /api/v1/call-control/:callId/hangup
 * POST /api/v1/call-control/:callId/hold
 * POST /api/v1/call-control/:callId/resume
 * POST /api/v1/call-control/:callId/mute
 * POST /api/v1/call-control/:callId/transfer
 * POST /api/v1/call-control/:callId/dtmf
 * GET  /api/v1/call-control/:callId/hold          (hold status)
 * POST /api/v1/call-control/device                (remember the selected audio device)
 *
 * Browser-originated SIP operations (mute, local hang-up) may use the active
 * SIP.js session directly; these routes exist for server-authorised and
 * PBX-backed operations (§9.2 function 7).
 */
import { isValidId, dialableTarget } from "@cloudtel/shared";
import { success, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import { PERMISSIONS, contextCan, requireOrganisation } from "../../../lib/authorisation.js";
import { audit } from "../../../lib/audit.js";
import { optionalBoolean, optionalString, requireString } from "../../../lib/validation.js";
import {
  answerCallOnPbx,
  hangupCallOnPbx,
  holdCallOnPbx,
  isPbxConfigured,
  muteCallOnPbx,
  sendDtmfOnPbx,
  transferCallOnPbx,
} from "../../../lib/pbx-client.js";

/** Load an active call the caller is allowed to control. */
async function loadControllableCall(ctx, callId) {
  const organisationId = requireOrganisation(ctx);
  if (!isValidId(callId)) throw new ApiError(404, "NOT_FOUND", "Active call not found.");
  const { rows } = await query(`SELECT * FROM call_records WHERE organisation_id = $1 AND id = $2`, [
    organisationId,
    callId,
  ]);
  const call = rows[0];
  if (!call || call.ended_at) throw new ApiError(404, "NOT_FOUND", "Active call not found.");
  const isOwner = call.user_id === ctx.user.id;
  if (!isOwner && !contextCan(ctx, PERMISSIONS.CALLS_READ_TEAM)) {
    throw new ApiError(404, "NOT_FOUND", "Active call not found.");
  }
  return call;
}

function requirePbx() {
  if (!isPbxConfigured()) {
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Call control is unavailable because the PBX integration is not configured."
    );
  }
}

async function recordControlAction(ctx, call, action, metadata) {
  await audit({
    organisationId: call.organisation_id,
    userId: ctx.user.id,
    action: `call_control.${action}`,
    resourceType: "call_record",
    resourceId: call.id,
    metadata: { providerCallId: call.provider_call_id, ...metadata },
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
}

function markAnswered(call) {
  return query(`UPDATE call_records SET answered_at = COALESCE(answered_at, now()), updated_at = now() WHERE id = $1`, [
    call.id,
  ]);
}

const routes = [
  {
    method: "POST",
    path: "/call-control/:callId/answer",
    auth: "session",
    handle: async (ctx) => {
      const call = await loadControllableCall(ctx, ctx.params.callId);
      if (call.provider_call_id && isPbxConfigured()) {
        const result = await answerCallOnPbx({ providerCallId: call.provider_call_id });
        if (!result.ok) throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `Answer failed: ${result.error}`);
      }
      await markAnswered(call);
      await recordControlAction(ctx, call, "answer", {});
      success(ctx.res, { accepted: true, callId: call.id, answered: true }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/call-control/:callId/hangup",
    auth: "session",
    handle: async (ctx) => {
      const call = await loadControllableCall(ctx, ctx.params.callId);
      if (call.provider_call_id) {
        requirePbx();
        const result = await hangupCallOnPbx({ providerCallId: call.provider_call_id });
        if (!result.ok) throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `Hang-up failed: ${result.error}`);
      }
      await query(
        `UPDATE call_records
            SET ended_at = COALESCE(ended_at, now()),
                duration_seconds = GREATEST(0, floor(extract(epoch FROM (COALESCE(ended_at, now()) - started_at))))::int,
                disposition = CASE
                  WHEN disposition <> 'cancelled' AND answered_at IS NOT NULL THEN 'answered'
                  WHEN answered_at IS NULL THEN 'cancelled'
                  ELSE disposition END,
                updated_at = now()
          WHERE id = $1`,
        [call.id]
      );
      await recordControlAction(ctx, call, "hangup", {});
      success(ctx.res, { accepted: true, callId: call.id }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/call-control/:callId/hold",
    auth: "session",
    handle: async (ctx) => {
      const call = await loadControllableCall(ctx, ctx.params.callId);
      if (!call.provider_call_id) {
        throw new ApiError(409, "CONFLICT", "This call cannot be held through the PBX.");
      }
      requirePbx();
      const result = await holdCallOnPbx({ providerCallId: call.provider_call_id, hold: true });
      if (!result.ok) throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `Hold failed: ${result.error}`);
      await recordControlAction(ctx, call, "hold", {});
      success(ctx.res, { accepted: true, callId: call.id, held: true }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/call-control/:callId/resume",
    auth: "session",
    handle: async (ctx) => {
      const call = await loadControllableCall(ctx, ctx.params.callId);
      if (!call.provider_call_id) {
        throw new ApiError(409, "CONFLICT", "This call cannot be resumed through the PBX.");
      }
      requirePbx();
      const result = await holdCallOnPbx({ providerCallId: call.provider_call_id, hold: false });
      if (!result.ok) throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `Resume failed: ${result.error}`);
      await recordControlAction(ctx, call, "resume", {});
      success(ctx.res, { accepted: true, callId: call.id, held: false }, { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/call-control/:callId/hold",
    auth: "session",
    handle: async (ctx) => {
      const call = await loadControllableCall(ctx, ctx.params.callId);
      const { rows } = await query(
        `SELECT payload FROM call_events
          WHERE organisation_id = $1 AND call_record_id = $2
          ORDER BY occurred_at DESC LIMIT 1`,
        [call.organisation_id, call.id]
      );
      const lastPayload = rows[0]?.payload || null;
      const held = Boolean(lastPayload && (lastPayload.held === true || lastPayload.eventType === "call.held"));
      success(ctx.res, { callId: call.id, held }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/call-control/:callId/mute",
    auth: "session",
    handle: async (ctx) => {
      const call = await loadControllableCall(ctx, ctx.params.callId);
      const muted = optionalBoolean(ctx.body, "muted", true);
      if (call.provider_call_id && isPbxConfigured()) {
        const result = await muteCallOnPbx({ providerCallId: call.provider_call_id, muted });
        if (!result.ok) throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `Mute failed: ${result.error}`);
      }
      await recordControlAction(ctx, call, muted ? "mute" : "unmute", {});
      success(ctx.res, { accepted: true, callId: call.id, muted }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/call-control/:callId/transfer",
    auth: "session",
    permission: PERMISSIONS.CALL_TRANSFER,
    handle: async (ctx) => {
      const target = dialableTarget(requireString(ctx.body, "target", { max: 32 }));
      if (!target) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          target: "Enter a valid transfer target.",
        });
      }
      const call = await loadControllableCall(ctx, ctx.params.callId);
      if (!call.provider_call_id) {
        throw new ApiError(409, "CONFLICT", "This call cannot be transferred through the PBX.");
      }
      requirePbx();
      const result = await transferCallOnPbx({ providerCallId: call.provider_call_id, target });
      if (!result.ok) {
        throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `Transfer failed: ${result.error}`);
      }
      await recordControlAction(ctx, call, "transfer", { target, attended: Boolean(ctx.body.attended) });
      success(ctx.res, { accepted: true, callId: call.id, target }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/call-control/:callId/dtmf",
    auth: "session",
    handle: async (ctx) => {
      const digits = requireString(ctx.body, "digits", { max: 32 });
      if (!/^[0-9*#A-D]+$/i.test(digits)) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          digits: "DTMF digits may only contain 0-9, *, # and A-D.",
        });
      }
      const call = await loadControllableCall(ctx, ctx.params.callId);
      if (call.provider_call_id && isPbxConfigured()) {
        const result = await sendDtmfOnPbx({ providerCallId: call.provider_call_id, digits });
        if (!result.ok) throw new ApiError(502, "DEPENDENCY_UNAVAILABLE", `DTMF failed: ${result.error}`);
      }
      await recordControlAction(ctx, call, "dtmf", { digits: digits.length });
      success(ctx.res, { accepted: true, callId: call.id, digits }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/call-control/device",
    auth: "session",
    handle: async (ctx) => {
      const inputDeviceId = optionalString(ctx.body, "inputDeviceId", { max: 200, allowEmpty: true });
      const outputDeviceId = optionalString(ctx.body, "outputDeviceId", { max: 200, allowEmpty: true });
      const patch = { calling: {} };
      if (inputDeviceId !== undefined) patch.calling.inputDeviceId = inputDeviceId || null;
      if (outputDeviceId !== undefined) patch.calling.outputDeviceId = outputDeviceId || null;
      if (!Object.keys(patch.calling).length) {
        throw new ApiError(422, "VALIDATION_ERROR", "No audio devices were supplied.");
      }
      const { rows } = await query(`SELECT preferences FROM user_settings WHERE user_id = $1`, [ctx.user.id]);
      const preferences = rows[0]?.preferences || {};
      const calling = { ...(preferences.calling || {}), ...patch.calling };
      const merged = { ...preferences, calling };
      await query(
        `INSERT INTO user_settings (user_id, organisation_id, preferences)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET preferences = $3, updated_at = now()`,
        [ctx.user.id, ctx.organisationId || null, JSON.stringify(merged)]
      );
      await audit({
        organisationId: ctx.organisationId,
        userId: ctx.user.id,
        action: "call_control.device",
        resourceType: "user_settings",
        resourceId: ctx.user.id,
        metadata: { inputDeviceId, outputDeviceId },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { calling }, { requestId: ctx.requestId });
    },
  },
];

export default createHandler(routes);
