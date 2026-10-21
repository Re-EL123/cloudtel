/** Page bootstrap for settings. */
import { initAppShell } from "../core/app-shell.js";
import { initSettings } from "../features/settings.js";

initAppShell().then((state) => {
  if (!state) return;
  initSettings();
});
