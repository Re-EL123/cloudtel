/**
 * PBX integration client (Asterisk administrative API).
 * All credentials stay server-side. Extension provisioning tracks explicit
 * states and surfaces partial failures (§12.2).
 *
 * The expected PBX-side interface (documented in docs/telephony.md):
 *   POST   {base}/extensions        { number, context, display_name } -> { endpointId }
 *   PUT    {base}/extensions/:id    { display_name, enabled }
 *   DELETE {base}/extensions/:id
 *   POST   {base}/calls/:id/transfer  { target }
 *   POST   {base}/calls/:id/hangup
 */

export function isPbxConfigured() {
  return Boolean(process.env.PBX_API_BASE_URL);
}

async function pbxFetch(path, { method = "GET", body } = {}) {
  const base = process.env.PBX_API_BASE_URL;
  if (!base) {
    const error = new Error("PBX integration is not configured.");
    error.code = "PBX_NOT_CONFIGURED";
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (process.env.PBX_API_USERNAME) {
      const credentials = `${process.env.PBX_API_USERNAME}:${process.env.PBX_API_PASSWORD || ""}`;
      headers.Authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(data?.message || `PBX responded ${response.status}`);
      error.code = "PBX_ERROR";
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Create a PBX endpoint. Returns { ok, endpointId } or { ok:false, error }. */
export async function provisionExtension(extension) {
  try {
    const data = await pbxFetch("/extensions", {
      method: "POST",
      body: {
        organisationId: extension.organisation_id,
        number: extension.number,
        context: extension.context,
        displayName: extension.display_name,
        maxConcurrentCalls: extension.max_concurrent_calls,
        allowExternal: extension.allow_external,
      },
    });
    return { ok: true, endpointId: data.endpointId || data.id || null };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function updateExtensionOnPbx(extension, changes = {}) {
  try {
    const data = await pbxFetch(`/extensions/${extension.pbx_endpoint_id || extension.id}`, {
      method: "PUT",
      body: changes,
    });
    return { ok: true, endpointId: data.endpointId || extension.pbx_endpoint_id || null };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function deleteExtensionOnPbx(extension) {
  try {
    await pbxFetch(`/extensions/${extension.pbx_endpoint_id || extension.id}`, { method: "DELETE" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function transferCallOnPbx({ providerCallId, target }) {
  try {
    const data = await pbxFetch(`/calls/${encodeURIComponent(providerCallId)}/transfer`, {
      method: "POST",
      body: { target },
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function hangupCallOnPbx({ providerCallId }) {
  try {
    const data = await pbxFetch(`/calls/${encodeURIComponent(providerCallId)}/hangup`, { method: "POST" });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function holdCallOnPbx({ providerCallId, hold }) {
  try {
    const data = await pbxFetch(`/calls/${encodeURIComponent(providerCallId)}/${hold ? "hold" : "resume"}`, {
      method: "POST",
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function answerCallOnPbx({ providerCallId }) {
  try {
    const data = await pbxFetch(`/calls/${encodeURIComponent(providerCallId)}/answer`, { method: "POST" });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function muteCallOnPbx({ providerCallId, muted }) {
  try {
    const data = await pbxFetch(`/calls/${encodeURIComponent(providerCallId)}/${muted ? "mute" : "unmute"}`, {
      method: "POST",
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

export async function sendDtmfOnPbx({ providerCallId, digits }) {
  try {
    const data = await pbxFetch(`/calls/${encodeURIComponent(providerCallId)}/dtmf`, {
      method: "POST",
      body: { digits },
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code || "PBX_ERROR" };
  }
}

/** Safe telephony configuration for the browser (no secrets). */
export function publicTelephonyConfig() {
  return {
    sipDomain: process.env.SIP_DOMAIN || "",
    wssUrl: process.env.SIP_WSS_URL || "",
    transport: process.env.SIP_TRANSPORT || "WSS",
    voicemailCode: process.env.SIP_VOICEMAIL_CODE || "*97",
    externalCallingEnabled: Boolean(process.env.PBX_API_BASE_URL) && process.env.EXTERNAL_CALLING_ENABLED === "true",
  };
}
