/** Theme + persistent UI preference handling. */
import { STORAGE_KEYS } from "./config.js";
import { loadJson, saveJson } from "./utils.js";
import { setState, getState } from "./state.js";

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(preference) {
  if (preference === "dark" || preference === "light") return preference;
  return media.matches ? "dark" : "light";
}

export function applyTheme(preference) {
  const pref = preference || loadJson(STORAGE_KEYS.THEME, "system") || "system";
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = pref;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0B1220" : "#38BDF8");
  setState({ theme: pref });
  return resolved;
}

export function setTheme(preference) {
  saveJson(STORAGE_KEYS.THEME, preference);
  applyTheme(preference);
}

export function initTheme() {
  const stored = loadJson(STORAGE_KEYS.THEME, "system");
  applyTheme(stored);
  media.addEventListener("change", () => {
    if ((getState().theme || "system") === "system") applyTheme("system");
  });
  document.documentElement.classList.add("theme-ready");
}

/** Mirror user settings (timezone, ringtone, device prefs) into local storage. */
export function applyUserPreferences(preferences = {}) {
  if (preferences.theme) setTheme(preferences.theme);
  if (preferences.inputDeviceId !== undefined) saveJson(STORAGE_KEYS.DEVICE_IN, preferences.inputDeviceId);
  if (preferences.outputDeviceId !== undefined) saveJson(STORAGE_KEYS.DEVICE_OUT, preferences.outputDeviceId);
  if (preferences.ringtone !== undefined) saveJson(STORAGE_KEYS.RINGTONE, preferences.ringtone);
  if (preferences.dialpadTones !== undefined) saveJson(STORAGE_KEYS.DIALPAD_TONES, preferences.dialpadTones);
}
