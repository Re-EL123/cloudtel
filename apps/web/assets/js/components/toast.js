/** Toast renderer — registers itself with the UI package notification bus. */
import { setNotificationRenderer } from "../ui/notifications.js";
import { icon } from "./icons.js";
import { uid } from "../core/utils.js";

const ICONS = { success: "checkCircle", error: "alertCircle", warning: "alertTriangle", info: "info" };

let region = null;

function ensureRegion() {
  if (region && document.body.contains(region)) return region;
  region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", "Notifications");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  return region;
}

function render(item) {
  const container = ensureRegion();
  const toast = document.createElement("div");
  toast.className = `toast toast--${item.type}`;
  toast.setAttribute("role", item.type === "error" ? "alert" : "status");

  const iconName = ICONS[item.type] || "info";
  const iconWrap = document.createElement("span");
  iconWrap.append(icon(iconName, { size: 18 }));
  toast.append(iconWrap);

  const content = document.createElement("div");
  content.className = "grow";
  if (item.title) {
    const title = document.createElement("div");
    title.className = "toast-title";
    title.textContent = item.title;
    content.append(title);
  }
  const message = document.createElement("div");
  message.className = "toast-message";
  message.textContent = item.message;
  content.append(message);
  toast.append(content);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Dismiss notification");
  close.append(icon("x", { size: 16 }));
  close.addEventListener("click", () => dismiss(toast));
  toast.append(close);

  container.append(toast);

  let timer = null;
  const dismiss = (node) => {
    clearTimeout(timer);
    node.style.transition = "opacity 150ms ease, transform 150ms ease";
    node.style.opacity = "0";
    node.style.transform = "translateY(8px)";
    setTimeout(() => node.remove(), 160);
  };
  if (item.timeout > 0) timer = setTimeout(() => dismiss(toast), item.timeout);
  return toast;
}

/** Install the toast renderer. */
export function initToasts() {
  setNotificationRenderer(render);
  ensureRegion();
}

export { render as renderToast };
