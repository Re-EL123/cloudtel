/** Page bootstrap for the team directory. */
import { initAppShell } from "../core/app-shell.js";
import { initTeam } from "../features/team.js";

initAppShell().then((state) => {
  if (!state) return;
  initTeam();
});
