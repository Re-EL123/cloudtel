/**
 * CloudTel dialog primitive built on <dialog>.
 * Handles backdrop click, Escape, focus trap and labelled headings.
 */
import { createButton, BUTTON_VARIANTS } from "./buttons.js";

/**
 * Open a modal dialog.
 * @param {object} options
 * @param {string} options.title
 * @param {Node|Node[]} [options.body] - content nodes
 * @param {Array<{label:string, variant?:string, value?:string, autofocus?:boolean, closeOnClick?:boolean}>} [options.actions]
 * @param {"sm"|"md"|"lg"} [options.size]
 * @param {boolean} [options.dismissible]
 * @returns {{ dialog: HTMLDialogElement, close: (value?: string) => void, promise: Promise<string|null> }}
 */
export function openDialog(options = {}) {
  const {
    title,
    body = [],
    actions = [],
    size = "md",
    dismissible = true,
  } = options;

  const dialog = document.createElement("dialog");
  dialog.className = `dialog${size === "lg" ? " dialog--wide" : ""}`;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", title);

  const header = document.createElement("header");
  header.className = "dialog-header";
  const heading = document.createElement("h2");
  heading.className = "dialog-title";
  heading.textContent = title;
  header.append(heading);
  if (dismissible) {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn--ghost btn--icon btn--sm dialog-close";
    closeBtn.setAttribute("aria-label", "Close dialog");
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener("click", () => finish(null));
    header.append(closeBtn);
  }
  dialog.append(header);

  const bodyEl = document.createElement("div");
  bodyEl.className = "dialog-body";
  for (const node of Array.isArray(body) ? body : [body]) {
    if (node) bodyEl.append(node);
  }
  dialog.append(bodyEl);

  const footer = document.createElement("footer");
  footer.className = "dialog-footer";
  const buttonNodes = [];
  for (const action of actions) {
    const btn = createButton({
      label: action.label,
      variant: action.variant || BUTTON_VARIANTS.SECONDARY,
      autofocus: Boolean(action.autofocus),
      onClick: () => {
        if (action.closeOnClick !== false) finish(action.value ?? null);
        if (typeof action.onClick === "function") action.onClick();
      },
    });
    if (action.autofocus) btn.setAttribute("autofocus", "");
    buttonNodes.push(btn);
    footer.append(btn);
  }
  if (actions.length) dialog.append(footer);

  let settled = false;
  let resolvePromise = null;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  function finish(value) {
    if (settled) return;
    settled = true;
    dialog.close();
    resolvePromise(value);
  }

  dialog.addEventListener("cancel", (event) => {
    if (!dismissible) {
      event.preventDefault();
      return;
    }
    finish(null);
  });

  dialog.addEventListener("click", (event) => {
    if (!dismissible) return;
    if (event.target === dialog) finish(null);
  });

  dialog.addEventListener("close", () => {
    resolvePromise(dialog.returnValue === "" ? null : dialog.returnValue);
  });

  document.body.append(dialog);
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }

  const autofocusBtn = buttonNodes.find((b) => b.hasAttribute("autofocus")) || buttonNodes[0];
  if (autofocusBtn) autofocusBtn.focus();

  return { dialog, close: finish, promise };
}

/** Convenience confirmation dialog. Resolves true when confirmed. */
export function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger" } = {}) {
  const body = document.createElement("p");
  body.className = "dialog-text";
  body.textContent = message;
  return openDialog({
    title,
    body: [body],
    actions: [
      { label: cancelLabel, variant: "secondary", value: "cancel" },
      { label: confirmLabel, variant, value: "confirm", autofocus: true },
    ],
  }).promise.then((value) => value === "confirm");
}
