/** Page bootstrap for administration. Redirects users without permission. */
import { initAppShell } from "../core/app-shell.js";
import { initAdmin } from "../features/admin.js";
import { getState } from "../core/state.js";
import { PERMISSIONS } from "../shared/index.js";

initAppShell().then((state) => {
  if (!state) return;
  if (!(getState().permissions || []).includes(PERMISSIONS.ADMIN_DASHBOARD)) {
    window.location.replace("/dialer.html");
    return;
  }
  initAdmin();
});
