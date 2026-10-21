/** Common presentational fragments shared across pages. */
import { icon } from "./icons.js";
import { initials as toInitials, escapeHtml } from "../core/utils.js";

/**
 * Circular avatar with initials or an image.
 * @param {{name?:string, src?:string, size?:'sm'|'md'|'lg'}} options
 */
export function avatar({ name = "", src = "", size = "md" } = {}) {
  const node = document.createElement("span");
  node.className = `avatar${size !== "md" ? ` avatar--${size}` : ""}`;
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    node.append(img);
  } else {
    node.textContent = toInitials(name);
    node.setAttribute("aria-hidden", "true");
  }
  if (name) node.setAttribute("title", name);
  return node;
}

/** Coloured status badge. */
export function badge(text, variant = "neutral") {
  const node = document.createElement("span");
  node.className = `badge badge--${variant}`;
  node.textContent = text;
  return node;
}

/** Badge that pairs colour with a dot AND a label (never colour alone). */
export function statusBadge(text, variant = "neutral") {
  const node = badge("", variant);
  const dot = document.createElement("span");
  dot.className = "badge-dot-inline";
  node.append(dot, document.createTextNode(text));
  return node;
}

/** Empty-state block with an icon, title, description and optional action. */
export function emptyState({ icon: iconName = "inbox", title, message, action = null } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.append(icon(iconName, { size: 40 }));
  const heading = document.createElement("div");
  heading.className = "empty-state-title";
  heading.textContent = title;
  wrap.append(heading);
  if (message) {
    const text = document.createElement("p");
    text.className = "empty-state-text";
    text.textContent = message;
    wrap.append(text);
  }
  if (action) wrap.append(action);
  return wrap;
}

/** List of skeleton rows for loading states. */
export function loadingRows(count = 5) {
  const wrap = document.createElement("div");
  wrap.className = "stack-sm";
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.className = "skeleton";
    row.style.height = "52px";
    wrap.append(row);
  }
  return wrap;
}

/** Section card with an optional header and action. */
export function card({ title, action = null, bodyClass = "" } = {}) {
  const node = document.createElement("section");
  node.className = "card";
  if (title) {
    const header = document.createElement("header");
    header.className = "card-header";
    const heading = document.createElement("h3");
    heading.className = "card-title";
    heading.textContent = title;
    header.append(heading);
    if (action) header.append(action);
    node.append(header);
  }
  const body = document.createElement("div");
  body.className = `card-body ${bodyClass}`.trim();
  node.append(body);
  node.body = body;
  return node;
}

/** Build a labelled field group without package dependency (settings pages). */
export function fieldGroup(labelText, control, { hint = "", error = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  if (control.id) label.setAttribute("for", control.id);
  wrap.append(label, control);
  if (hint) {
    const hintEl = document.createElement("p");
    hintEl.className = "field-hint";
    hintEl.textContent = hint;
    wrap.append(hintEl);
  }
  if (error) {
    const errorEl = document.createElement("p");
    errorEl.className = "field-error";
    errorEl.textContent = error;
    wrap.append(errorEl);
  }
  return wrap;
}

export { escapeHtml };
