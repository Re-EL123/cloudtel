/**
 * CloudTel client configuration.
 *
 * Static constants live here. The environment-specific values (API base URL and
 * public telephony identifiers) are loaded at runtime from `config.json` so the
 * same build can be served from GitHub Pages, Vercel, or localhost without
 * rebuilding — only `config.json` differs.
 *
 * Call `initConfig()` once at boot (see core/app-shell.js / pages) before any
 * request. Modules should read the API base through `getApiBase()` rather than
 * capturing it at import time.
 */

export const STORAGE_KEYS = Object.freeze({
  THEME: "cloudtel.theme",
  DEVICE_IN: "cloudtel.deviceInId",
  DEVICE_OUT: "cloudtel.deviceOutId",
  RINGTONE: "cloudtel.ringtone",
  DIALPAD_TONES: "cloudtel.dialpadTones",
  LAST_NUMBER: "cloudtel.lastNumber",
  CONTACT_PANEL: "cloudtel.contactPanel",
  OFFLINE_SEEN: "cloudtel.offlineSeen",
});

export const APP = Object.freeze({
  NAME: "CloudTel",
  VENDOR: "Re-EL Branding & Technologies",
  VERSION: "1.0.0",
  DEFAULT_TIMEZONE: "Africa/Johannesburg",
});

/** Same-origin fallback keeps the Vercel/localhost deployments working. */
const DEFAULT_API_BASE = "/api/v1";

const DEFAULT_PUBLIC_TELEPHONY = Object.freeze({
  sipDomain: "",
  wssUrl: "",
  transport: "WSS",
  voicemailCode: "*97",
  externalCallingEnabled: false,
});

/**
 * Mutable runtime configuration. Populated by `initConfig()`.
 * @type {{ apiBaseUrl: string, environment: string, publicTelephony: object, loaded: boolean }}
 */
export const RUNTIME = {
  apiBaseUrl: DEFAULT_API_BASE,
  environment: "development",
  publicTelephony: { ...DEFAULT_PUBLIC_TELEPHONY },
  loaded: false,
};

let configPromise = null;

/** Resolve `config.json` relative to the current document so it works from any base path. */
function resolveConfigUrl() {
  // `./config.json` is relative to the page location; use the URL API so a
  // subpath deployment (project pages) resolves correctly too.
  return new URL("config.json", document.baseURI).toString();
}

function applyConfig(raw) {
  if (!raw || typeof raw !== "object") return;
  if (typeof raw.apiBaseUrl === "string" && raw.apiBaseUrl.trim()) {
    RUNTIME.apiBaseUrl = raw.apiBaseUrl.trim().replace(/\/+$/, "");
  }
  if (typeof raw.environment === "string" && raw.environment.trim()) {
    RUNTIME.environment = raw.environment.trim();
  }
  if (raw.publicTelephony && typeof raw.publicTelephony === "object") {
    RUNTIME.publicTelephony = { ...DEFAULT_PUBLIC_TELEPHONY, ...raw.publicTelephony };
  }
  RUNTIME.loaded = true;
}

/**
 * Load `config.json` once. Safe to call multiple times (memoised).
 * Never throws: on failure it keeps the same-origin defaults so the app can
 * still boot and surface a network error to the user.
 * @returns {Promise<typeof RUNTIME>}
 */
export function initConfig() {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      const response = await fetch(resolveConfigUrl(), { cache: "no-store" });
      if (response.ok) {
        applyConfig(await response.json());
      }
    } catch {
      // Keep defaults; the API client will report a network error if unusable.
    }
    return RUNTIME;
  })();
  return configPromise;
}

/** The API base URL, e.g. "https://api.example.com/api/v1" or "/api/v1". */
export function getApiBase() {
  return RUNTIME.apiBaseUrl;
}

/** Public telephony identifiers (never contains SIP passwords). */
export function getPublicTelephony() {
  return RUNTIME.publicTelephony;
}

/** True when the API is hosted on a different origin than the app. */
export function isCrossOriginApi() {
  try {
    const apiUrl = new URL(RUNTIME.apiBaseUrl, document.baseURI);
    return apiUrl.origin !== window.location.origin;
  } catch {
    return false;
  }
}
