/** Page bootstrap for voicemail. */
import { initAppShell } from "../core/app-shell.js";
import { initVoicemail } from "../features/voicemail.js";

initAppShell().then((state) => {
  if (!state) return;
  initVoicemail();
});
