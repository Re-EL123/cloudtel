/** In-app navigation plus a hash-positioned fallback for unsupported hosts. */
import { AUTH_STATUS, getAuthStatus, touchSession } from "./auth.js";
import { PERMISSIONS } from "../shared/index.js";
import { icon } from "../components/icons.js";

export const NAV_ITEMS = Object.freeze([
  { group: "Workspace" },
  { id: "dialer", label: "Dialer", href: "/dialer.html", icon: "phoneCall" },
  { id: "contacts", label: "Contacts", href: "/contacts.html", icon: "users" },
  { id: "history", label: "Call history", href: "/history.html", icon: "history" },
  { id: "voicemail", label: "Voicemail", href: "/voicemail.html", icon: "voicemail" },
  { group: "Directory" },
  { id: "team", label: "Team", href: "/team.html", icon: "grid3x3" },
  { group: "Settings" },
  { id: "settings", label: "Preferences", href: "/settings.html", icon: "settings" },
  { id: "account", label: "Account", href: "/settings.html#account", icon: "user" },
  { id: "admin", label: "Administration", href: "/admin.html", icon: "shield", permission: PERMISSIONS.ADMIN_DASHBOARD },
]);

export function currentPage() {
  const path = window.location.pathname.split("/").pop() || "dialer.html";
  return path.replace(".html", "");
}

export function pageUrl(pageId) {
  return `/${pageId}.html`;
}

/**
 * Render the sidebar navigation into a container.
 * @param {HTMLElement} container
 * @param {{permissions?: string[], badgeCounts?: Record<string, number>}} [options]
 */
export function renderNav(container, { permissions = [], badgeCounts = {} } = {}) {
  container.replaceChildren();
  const active = currentPage();

  for (const item of NAV_ITEMS) {
    if (item.group) {
      const label = document.createElement("div");
      label.className = "app-nav-group-label";
      label.textContent = item.group;
      container.append(label);
      continue;
    }
    if (item.permission && !permissions.includes(item.permission)) continue;

    const link = document.createElement("a");
    link.className = "app-nav-link";
    link.href = item.href;
    const isActive = item.id === active || (active === "login" && item.id === "dialer");
    if (item.id === active) link.setAttribute("aria-current", "page");
    if (isActive) link.classList.add("is-current");
    link.append(icon(item.icon, { size: 20 }));
    const text = document.createElement("span");
    text.textContent = item.label;
    link.append(text);
    const badgeCount = badgeCounts[item.id];
    if (badgeCount > 0) {
      const count = document.createElement("span");
      count.className = "app-nav-badge";
      count.textContent = String(badgeCount > 99 ? "99+" : badgeCount);
      link.append(count);
    }
    container.append(link);
  }
}

/** Navigate programmatically, keeping unknown hosts happy. */
export function navigate(href) {
  window.location.assign(href);
}

/** Keep the session warm while the user is active. */
export function startSessionKeepAlive(intervalMs = 5 * 60 * 1000) {
  const tick = () => {
    if (getAuthStatus() === AUTH_STATUS.AUTHENTICATED && !document.hidden) touchSession();
  };
  const timer = setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
  return () => clearInterval(timer);
}
