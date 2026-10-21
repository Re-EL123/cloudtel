/**
 * CloudTel button primitive.
 * Creates a class-based <button> consistent with the design system.
 */

export const BUTTON_VARIANTS = Object.freeze({
  PRIMARY: "primary",
  SECONDARY: "secondary",
  GHOST: "ghost",
  DANGER: "danger",
  DANGER_OUTLINE: "danger-outline",
  SUCCESS: "success",
  CALL: "success",
});

/**
 * @param {object} options
 * @param {string} options.label
 * @param {string} [options.variant]
 * @param {string} [options.size] - "sm" | "md" | "lg"
 * @param {string} [options.type] - button | submit | reset
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.block]
 * @param {boolean} [options.iconOnly]
 * @param {string} [options.ariaLabel]
 * @param {(event: MouseEvent) => void} [options.onClick]
 * @param {Node} [options.icon] - leading icon node
 * @returns {HTMLButtonElement}
 */
export function createButton(options = {}) {
  const {
    label = "",
    variant = BUTTON_VARIANTS.SECONDARY,
    size = "md",
    type = "button",
    disabled = false,
    block = false,
    iconOnly = false,
    ariaLabel,
    onClick,
    icon = null,
    className = "",
  } = options;

  const button = document.createElement("button");
  button.type = type;
  button.className = [
    "btn",
    `btn--${variant}`,
    size !== "md" ? `btn--${size}` : "",
    block ? "btn--block" : "",
    iconOnly ? "btn--icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (icon) button.append(icon);
  if (label) {
    const labelWrap = document.createElement("span");
    labelWrap.className = "btn-label";
    labelWrap.textContent = label;
    button.append(labelWrap);
  }
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  button.disabled = Boolean(disabled);
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

export function setButtonBusy(button, busy, busyLabel = "Working...") {
  if (!(button instanceof HTMLButtonElement)) return;
  const label = button.querySelector(".btn-label");
  if (busy) {
    button.dataset.prevLabel = label ? label.textContent : "";
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    if (label) label.textContent = busyLabel;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    if (label && button.dataset.prevLabel) label.textContent = button.dataset.prevLabel;
  }
}

export function toggleButton(button, active, { activeClass = "is-active" } = {}) {
  if (!button) return;
  button.classList.toggle(activeClass, Boolean(active));
  button.setAttribute("aria-pressed", active ? "true" : "false");
}
