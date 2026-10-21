/** Page bootstrap for the dialer. */
import { initAppShell } from "../core/app-shell.js";
import { initDialer } from "../features/dialer.js";

initAppShell().then((state) => {
  if (!state) return;
  initDialer();
});
