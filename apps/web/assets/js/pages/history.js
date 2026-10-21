/** Page bootstrap for call history. */
import { initAppShell } from "../core/app-shell.js";
import { initHistory } from "../features/history.js";

initAppShell().then((state) => {
  if (!state) return;
  initHistory();
});
