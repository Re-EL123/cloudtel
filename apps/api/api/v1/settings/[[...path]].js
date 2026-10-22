/**
 * Serverless function 8: Settings
 * GET   /api/v1/settings
 * PUT   /api/v1/settings
 * PATCH /api/v1/settings
 * GET   /api/v1/settings/telephony
 * PATCH /api/v1/settings/telephony
 * GET   /api/v1/settings/audio
 * PATCH /api/v1/settings/audio
 * GET   /api/v1/settings/notifications
 * PATCH /api/v1/settings/notifications
 *
 * The telephony endpoint returns public identifiers only - never SIP passwords
 * or PBX credentials (§13.3).
 */
import { randomBytes } from "node:crypto";
import { DEFAULT_SETTINGS, THEMES, isValidId } from "@cloudtel/shared";
import { success, ApiError, handler } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import { PERMISSIONS, requireOrganisation } from "../../../lib/authorisation.js";
import { audit } from "../../../lib/audit.js";
import { optionalBoolean, optionalString } from "../../../lib/validation.js";
import {
  iceServers,
  isPbxConfigured,
  provisionExtension,
  publicTelephonyConfig,
  updateExtensionOnPbx,
} from "../../../lib/pbx-client.js";

const AUDIO_KEYS = ["inputDeviceId", "outputDeviceId", "ringtone", "incomingCallSound", "dialpadTones"];
const NOTIFICATION_KEYS = ["notificationsEnabled", "incomingCallSound", "dialpadTones", "confirmOutboundCalls", "timezone"];

async function loadPreferences(userId) {
  const { rows } = await query(`SELECT preferences FROM user_settings WHERE user_id = $1`, [userId]);
  return rows[0]?.preferences || {};
}

async function savePreferences(userId, organisationId, patch) {
  const merged = { ...DEFAULT_SETTINGS, ...(await loadPreferences(userId)), ...patch };
  const { rows } = await query(
    `INSERT INTO user_settings (user_id, organisation_id, preferences)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET preferences = $3, updated_at = now()
     RETURNING preferences`,
    [userId, organisationId || null, JSON.stringify(merged)]
  );
  return rows[0].preferences;
}

function publicSettings(preferences) {
  return { ...DEFAULT_SETTINGS, ...preferences };
}

/** Validate and normalise a user-settings patch body. Throws on invalid input. */
function buildPreferencesPatch(body = {}) {
  const patch = {};
  if (body.theme !== undefined) {
    if (!Object.values(THEMES).includes(body.theme)) {
      throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
        theme: "Choose light, dark or system.",
      });
    }
    patch.theme = body.theme;
  }
  if (body.compactLayout !== undefined) patch.compactLayout = optionalBoolean(body, "compactLayout");
  if (body.notificationsEnabled !== undefined) patch.notificationsEnabled = optionalBoolean(body, "notificationsEnabled");
  if (body.incomingCallSound !== undefined) patch.incomingCallSound = optionalBoolean(body, "incomingCallSound");
  if (body.dialpadTones !== undefined) patch.dialpadTones = optionalBoolean(body, "dialpadTones");
  if (body.ringtone !== undefined) {
    patch.ringtone = optionalString(body, "ringtone", { max: 40, allowEmpty: false });
  }
  if (body.confirmOutboundCalls !== undefined) {
    patch.confirmOutboundCalls = optionalBoolean(body, "confirmOutboundCalls");
  }
  if (body.inputDeviceId !== undefined) {
    patch.inputDeviceId = optionalString(body, "inputDeviceId", { max: 200, allowEmpty: true }) || null;
  }
  if (body.outputDeviceId !== undefined) {
    patch.outputDeviceId = optionalString(body, "outputDeviceId", { max: 200, allowEmpty: true }) || null;
  }
  if (body.preferredNumberFormat !== undefined) {
    const format = optionalString(body, "preferredNumberFormat", { max: 20, allowEmpty: false });
    if (!["international", "local"].includes(format)) {
      throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
        preferredNumberFormat: "Choose international or local.",
      });
    }
    patch.preferredNumberFormat = format;
  }
  if (body.timezone !== undefined) {
    const timezone = optionalString(body, "timezone", { max: 64, allowEmpty: false });
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
        timezone: "Unknown time zone.",
      });
    }
    patch.timezone = timezone;
  }
  if (body.locale !== undefined) {
    patch.locale = optionalString(body, "locale", { max: 20, allowEmpty: false });
  }
  return patch;
}

function pickKeys(preferences, keys) {
  const full = publicSettings(preferences);
  return Object.fromEntries(keys.map((key) => [key, full[key]]));
}

async function handleSettingsUpdate(ctx) {
  const patch = buildPreferencesPatch(ctx.body || {});
  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "No updatable settings were supplied.");
  }
  const preferences = await savePreferences(ctx.user.id, ctx.organisationId, patch);
  await audit({
    organisationId: ctx.organisationId,
    userId: ctx.user.id,
    action: "settings.update",
    resourceType: "user_settings",
    resourceId: ctx.user.id,
    metadata: { keys: Object.keys(patch) },
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
  success(ctx.res, publicSettings(preferences), { requestId: ctx.requestId });
}

const routes = [
  {
    method: "GET",
    path: "/settings",
    auth: "session",
    handle: async (ctx) => {
      success(ctx.res, publicSettings(await loadPreferences(ctx.user.id)), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/settings",
    auth: "session",
    permission: PERMISSIONS.SETTINGS_MANAGE,
    handle: handleSettingsUpdate,
  },

  {
    method: "PUT",
    path: "/settings",
    auth: "session",
    permission: PERMISSIONS.SETTINGS_MANAGE,
    handle: handleSettingsUpdate,
  },

  {
    method: "GET",
    path: "/settings/audio",
    auth: "session",
    handle: async (ctx) => {
      const preferences = await loadPreferences(ctx.user.id);
      success(ctx.res, pickKeys(preferences, AUDIO_KEYS), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/settings/audio",
    auth: "session",
    permission: PERMISSIONS.SETTINGS_MANAGE,
    handle: async (ctx) => {
      const patch = buildPreferencesPatch(ctx.body || {});
      const audioPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => AUDIO_KEYS.includes(key)));
      if (Object.keys(audioPatch).length === 0) {
        throw new ApiError(422, "VALIDATION_ERROR", "No updatable audio settings were supplied.");
      }
      const preferences = await savePreferences(ctx.user.id, ctx.organisationId, audioPatch);
      await audit({
        organisationId: ctx.organisationId,
        userId: ctx.user.id,
        action: "settings.audio_update",
        resourceType: "user_settings",
        resourceId: ctx.user.id,
        metadata: { keys: Object.keys(audioPatch) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, pickKeys(preferences, AUDIO_KEYS), { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/settings/notifications",
    auth: "session",
    handle: async (ctx) => {
      const preferences = await loadPreferences(ctx.user.id);
      success(ctx.res, pickKeys(preferences, NOTIFICATION_KEYS), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/settings/notifications",
    auth: "session",
    permission: PERMISSIONS.SETTINGS_MANAGE,
    handle: async (ctx) => {
      const patch = buildPreferencesPatch(ctx.body || {});
      const notificationPatch = Object.fromEntries(
        Object.entries(patch).filter(([key]) => NOTIFICATION_KEYS.includes(key))
      );
      if (Object.keys(notificationPatch).length === 0) {
        throw new ApiError(422, "VALIDATION_ERROR", "No updatable notification settings were supplied.");
      }
      const preferences = await savePreferences(ctx.user.id, ctx.organisationId, notificationPatch);
      await audit({
        organisationId: ctx.organisationId,
        userId: ctx.user.id,
        action: "settings.notifications_update",
        resourceType: "user_settings",
        resourceId: ctx.user.id,
        metadata: { keys: Object.keys(notificationPatch) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, pickKeys(preferences, NOTIFICATION_KEYS), { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/settings/telephony",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(
        `SELECT e.id, e.number, e.display_name, e.status, e.provisioning_status, e.allow_external,
                e.max_concurrent_calls, e.context, e.sip_password, e.pbx_endpoint_id, e.organisation_id
           FROM extensions e
          WHERE e.organisation_id = $1 AND e.user_id = $2 AND e.status = 'active'
          ORDER BY e.number
          LIMIT 5`,
        [organisationId, ctx.user.id]
      );
      const preferences = await loadPreferences(ctx.user.id);
      const sip = publicTelephonyConfig();
      const extension = rows[0] || null;
      let password = extension?.sip_password || "";
      let provisioned = !isPbxConfigured();

      // Provision the caller's own extension on demand. This keeps the PBX in
      // sync with CloudTel (the source of truth) and self-heals seeded or
      // pre-existing extensions after a PBX deployment.
      if (extension && isPbxConfigured()) {
        if (!password) {
          password = randomBytes(32).toString("base64url");
          await query(
            `UPDATE extensions SET sip_password = $2, sip_password_updated_at = now(), updated_at = now() WHERE id = $1`,
            [extension.id, password]
          );
        }
        const payload = { ...extension, sip_password: password };
        let result = await updateExtensionOnPbx(payload, { password });
        if (!result.ok) result = await provisionExtension(payload);
        provisioned = result.ok;
        if (result.ok) {
          await query(
            `UPDATE extensions SET pbx_endpoint_id = COALESCE(pbx_endpoint_id, $2),
                    provisioning_status = 'ready', provisioning_error = NULL,
                    provisioned_at = COALESCE(provisioned_at, now()), updated_at = now()
              WHERE id = $1`,
            [extension.id, result.endpointId || String(extension.number)]
          );
        } else {
          await query(
            `UPDATE extensions SET provisioning_status = 'error', provisioning_error = $2, updated_at = now() WHERE id = $1`,
            [extension.id, String(result.error || "PBX provisioning failed").slice(0, 500)]
          );
        }
      }

      const configured = Boolean(
        extension && password && sip.sipDomain && sip.wssUrl && provisioned
      );
      success(
        ctx.res,
        {
          configured,
          extensionId: extension?.id || null,
          extensionNumber: extension?.number || null,
          displayName: extension?.display_name || null,
          sipUri: extension ? `sip:${extension.number}@${sip.sipDomain}` : null,
          wsUrl: sip.wssUrl,
          // Returned only to the authenticated owner of this extension over
          // HTTPS so SIP.js can complete digest authentication. Never included
          // in organisation-wide listings.
          password: configured ? password : null,
          iceServers: iceServers(),
          sip,
          extensions: rows.map((r) => ({
            id: r.id,
            number: r.number,
            displayName: r.display_name,
            status: r.status,
            provisioningStatus: r.provisioning_status,
            allowExternal: r.allow_external,
            maxConcurrentCalls: r.max_concurrent_calls,
          })),
          calling: preferences.calling || {},
          registrationHint: configured
            ? null
            : rows.length === 0
              ? "No active extension is assigned to your account. Ask an administrator to assign one."
              : provisioned
                ? "Telephony is not configured on the server yet."
                : "The phone system is temporarily unavailable. Try again shortly.",
        },
        { requestId: ctx.requestId }
      );
    },
  },

  {
    method: "PATCH",
    path: "/settings/telephony",
    auth: "session",
    permission: PERMISSIONS.SETTINGS_MANAGE,
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const body = ctx.body || {};
      const calling = {};

      if (body.defaultExtensionId !== undefined) {
        const extensionId = optionalString(body, "defaultExtensionId", { max: 64, allowEmpty: true });
        if (extensionId) {
          if (!isValidId(extensionId)) {
            throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
              defaultExtensionId: "Invalid extension.",
            });
          }
          const { rows } = await query(
            `SELECT id FROM extensions WHERE id = $1 AND organisation_id = $2 AND user_id = $3 AND status = 'active'`,
            [extensionId, organisationId, ctx.user.id]
          );
          if (!rows[0]) {
            throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
              defaultExtensionId: "That extension is not assigned to you.",
            });
          }
        }
        calling.defaultExtensionId = extensionId || null;
      }
      if (body.ringtone !== undefined) {
        calling.ringtone = optionalString(body, "ringtone", { max: 40, allowEmpty: false });
      }
      if (body.confirmOutboundCalls !== undefined) {
        calling.confirmOutboundCalls = optionalBoolean(body, "confirmOutboundCalls");
      }

      if (Object.keys(calling).length === 0) {
        throw new ApiError(422, "VALIDATION_ERROR", "No updatable telephony settings were supplied.");
      }

      const preferences = await loadPreferences(ctx.user.id);
      const saved = await savePreferences(ctx.user.id, ctx.organisationId, { calling: { ...preferences.calling, ...calling } });
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "settings.telephony_update",
        resourceType: "user_settings",
        resourceId: ctx.user.id,
        metadata: { keys: Object.keys(calling) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { calling: saved.calling || {} }, { requestId: ctx.requestId });
    },
  },
];

export default handler(createHandler(routes));
