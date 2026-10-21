/** Page bootstrap for contacts. */
import { initAppShell } from "../core/app-shell.js";
import { initContacts } from "../features/contacts.js";

initAppShell().then((state) => {
  if (!state) return;
  initContacts();
});
