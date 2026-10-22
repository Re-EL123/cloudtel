/** Minimal Asterisk ARI client (HTTP only) used by the PBX admin API. */
export function createAri({ baseUrl, username, password }) {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  async function call(method, apiPath, { query } = {}) {
    const url = new URL(`${baseUrl}/ari${apiPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        const error = new Error(
          (data && (data.message || data.error)) || `ARI responded ${response.status}`
        );
        error.status = response.status;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  const channel = (id) => `/channels/${encodeURIComponent(id)}`;

  return {
    ping: () => call("GET", "/asterisk/info"),
    reloadPjsip: () => call("PUT", "/asterisk/modules/res_pjsip.so"),
    listEndpoints: (tech = "PJSIP") => call("GET", "/endpoints", { query: { tech } }),
    answer: (id) => call("POST", `${channel(id)}/answer`),
    hangup: (id) => call("DELETE", channel(id)),
    hold: (id) => call("POST", `${channel(id)}/hold`),
    resume: (id) => call("DELETE", `${channel(id)}/hold`),
    mute: (id) => call("POST", `${channel(id)}/mute`, { query: { direction: "both" } }),
    unmute: (id) => call("DELETE", `${channel(id)}/mute`, { query: { direction: "both" } }),
    sendDtmf: (id, digits) => call("POST", `${channel(id)}/dtmf`, { query: { dtmf: digits } }),
    redirect: (id, endpoint) => call("POST", `${channel(id)}/redirect`, { query: { endpoint } }),
  };
}
