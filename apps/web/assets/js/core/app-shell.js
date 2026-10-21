/**
 * Application shell: builds the sidebar, header, status bar, wires global
 * shortcuts and bootstraps a page. Every authenticated HTML page calls
 * `initAppShell()` once.
 */
import { APP, STORAGE_KEYS } from "./config.js";
import { api } from "./api-client.js";
import { getState, setState, subscribe } from "./state.js";
import { AUTH_STATUS, getAuthStatus, requireAuth, logout, restoreSession } from "./auth.js";
import { initTheme, setTheme } from "./preferences.js";
import { renderNav, startSessionKeepAlive, navigate, pageUrl } from "./router.js";
import { emit, on } from "./event-bus.js";
import { $optional, loadJson, saveJson, initials, escapeHtml } from "./utils.js";
import { icon } from "../components/icons.js";
import { attachMenu } from "../components/menu.js";
import { initToasts } from "../components/toast.js";
import { avatar } from "../components/common.js";
import { NOTIFY_TYPES, notify } from "../ui/notifications.js";

let shellReady = false;

/** @param {{ pageId?: string, requireAuth?: boolean, onReady?: Function }} options */
export async function initAppShell(options = {}) {
  const { requireAuth: needsAuth = true, onReady = null } = options;

  initTheme();
  initToasts();

  if (needsAuth) {
    const authenticated = await restoreSession();
    if (!authenticated || !requireAuth()) {
      return null;
    }
  }

  if (shellReady) {
    onReady?.();
    return getState();
  }

  buildSidebar();
  buildHeader();
  buildStatusBar();
  wireGlobalShortcuts();
  applyStateToShell();
  subscribe(() => applyStateToShell());

  startSessionKeepAlive();
  monitorConnectivity();

  shellReady = true;
  onReady?.();
  emit("shell:ready");
  return getState();
}

function buildSidebar() {
  const sidebar = $optional(".app-sidebar") || createSidebar();
  const nav = sidebar.querySelector(".app-nav");
  renderNav(nav, { permissions: getState().permissions });

  const brand = sidebar.querySelector(".app-brand-name");
  if (brand) brand.innerHTML = `Cloud<span>Tel</span>`;

  const footer = sidebar.querySelector(".app-sidebar-footer");
  if (footer) footer.textContent = `${APP.NAME} v${APP.VERSION} · ${APP.VENDOR}`;

  wireMobileNav(sidebar);
}

function createSidebar() {
  const aside = document.createElement("aside");
  aside.className = "app-sidebar";
  aside.innerHTML = `
    <div class="app-brand">
      <img src="/assets/img/logo.svg" alt="" />
      <div class="app-brand-name">Cloud<span>Tel</span></div>
    </div>
    <nav class="app-nav" aria-label="Primary"></nav>
    <div class="app-sidebar-footer"></div>`;
  const shell = document.querySelector(".app") || document.body;
  shell.prepend(aside);
  return aside;
}

function wireMobileNav(sidebar) {
  const toggle = $optional(".nav-toggle");
  const backdrop = $optional(".sidebar-backdrop");
  if (!toggle) return;
  const close = () => {
    sidebar.classList.remove("is-open");
    backdrop?.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const open = !sidebar.classList.contains("is-open");
    sidebar.classList.toggle("is-open", open);
    backdrop?.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  backdrop?.addEventListener("click", close);
  sidebar.addEventListener("click", (event) => {
    if (event.target.closest(".app-nav-link")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function buildHeader() {
  const header = $optional(".app-header");
  const userBtn = $optional(".header-user-btn");
  if (!header || !userBtn) return;

  const notifBtn = $optional(".header-notifications");
  notifBtn?.addEventListener("click", () => navigate(pageUrl("voicemail")));

  const helpBtn = $optional(".header-help");
  helpBtn?.addEventListener("click", () => window.open("/docs/help.html", "_blank", "noopener"));

  const search = $optional(".header-search-input", header);
  search?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && search.value.trim()) {
      const q = encodeURIComponent(search.value.trim());
      saveJson(STORAGE_KEYS.LAST_NUMBER, search.value.trim());
      window.location.assign(`${pageUrl("contacts")}?q=${q}`);
    }
  });

  bindUserMenu(userBtn);
}

function bindUserMenu(trigger) {
  const state = getState();
  const user = state.user || {};
  const avatarNode = trigger.querySelector(".header-user-avatar");
  if (avatarNode) {
    avatarNode.replaceWith(avatar({ name: user.name || user.email || "", size: "sm" }));
  }

  const items = [
    { label: user.email || "Account", icon: "user", disabled: true },
    { separator: true },
    { label: "Preferences", icon: "settings", onSelect: () => navigate(pageUrl("settings")) },
    { label: "Account settings", icon: "shield", onSelect: () => navigate(`${pageUrl("settings")}#account`) },
    { label: "Help", icon: "helpCircle", onSelect: () => window.open("/docs/help.html", "_blank", "noopener") },
    { separator: true },
    {
      label: `Appearance: ${getState().theme}`,
      icon: "sun",
      onSelect: () => setTheme(nextTheme(getState().theme)),
    },
    { separator: true },
    { label: "Sign out", icon: "logOut", danger: true, onSelect: handleSignOut },
  ];
  attachMenu(trigger, items, { align: "right" });
}

function nextTheme(current) {
  return current === "light" ? "dark" : current === "dark" ? "system" : "light";
}

function buildStatusBar() {
  const bar = $optional(".app-statusbar");
  if (!bar) return;
  bar.innerHTML = `
    <span class="status-item" data-status="audio">
      <span class="status-dot" data-dot="audio"></span>
      <span data-text="audio">Audio initialising…</span>
    </span>
    <span class="status-item" data-status="mic">
      <span data-dot="mic" class="status-dot"></span>
      <span data-text="mic">Microphone: default</span>
    </span>
    <span class="status-item" data-status="speaker">
      <span data-dot="speaker" class="status-dot"></span>
      <span data-text="speaker">Speaker: default</span>
    </span>
    <span class="status-item" data-status="network">
      <span data-dot="network" class="status-dot"></span>
      <span data-text="network">Network: online</span>
    </span>`;
}

function setStatus(key, { text, tone = "" } = {}) {
  const dot = document.querySelector(`[data-dot="${key}"]`);
  const label = document.querySelector(`[data-text="${key}"]`);
  if (dot) dot.className = `status-dot${tone ? ` is-${tone}` : ""}`;
  if (label && text) label.textContent = text;
}

/** React to state updates that concern the whole shell. */
function applyStateToShell() {
  const state = getState();

  if (state.online !== undefined) {
    setStatus("network", {
      text: state.online ? "Network: online" : "Network: offline",
      tone: state.online ? "success" : "danger",
    });
  }

  const regDot = document.querySelector('[data-badge="registration"]');
  if (regDot) {
    const tone =
      state.registrationStatus === "registered"
        ? "success"
        : state.registrationStatus === "registering"
          ? "warning"
          : state.registrationStatus === "error"
            ? "danger"
            : "";
    regDot.className = `status-dot${tone ? ` is-${tone}` : ""}`;
  }

  const badge = document.querySelector('.app-nav-link[href="/voicemail.html"] .app-nav-badge');
  if (state.voicemailUnread > 0) {
    if (!badge) {
      const link = document.querySelector('.app-nav-link[href="/voicemail.html"]');
      if (link) {
        const el = document.createElement("span");
        el.className = "app-nav-badge";
        el.textContent = String(state.voicemailUnread);
        link.append(el);
      }
    } else if (badge.textContent !== String(state.voicemailUnread)) {
      badge.textContent = String(state.voicemailUnread);
    }
  } else if (badge) {
    badge.remove();
  }
}

function wireGlobalShortcuts() {
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && /input|textarea|select/i.test(target.tagName);
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (!typing && event.key === "/") {
      event.preventDefault();
      navigate(pageUrl("contacts"));
    }
  });
}

function monitorConnectivity() {
  setState({ online: navigator.onLine });
  window.addEventListener("online", () => {
    setState({ online: true });
    notify({ type: NOTIFY_TYPES.SUCCESS, message: "Connection restored.", title: "Online" });
  });
  window.addEventListener("offline", () => {
    setState({ online: false });
    notify({ type: NOTIFY_TYPES.WARNING, message: "You are offline. Calls and updates will resume when reconnected.", title: "Offline" });
  });
}

async function handleSignOut() {
  await logout();
  navigate("/login.html");
}

/** Set the document title consistently. */
export function setPageTitle(title) {
  document.title = title ? `${title} · ${APP.NAME}` : APP.NAME;
}

/** Convenience: mark the sidebar link for a sub-route as active. */
export function markSettingsSection(sectionId) {
  document.querySelectorAll(".settings-nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href")?.endsWith(`#${sectionId}`));
  });
}

/** Exposed for the header avatar refresh after profile changes. */
export function refreshHeaderUser() {
  const trigger = $optional(".header-user-btn");
  const user = getState().user;
  if (!trigger || !user) return;
  const node = trigger.querySelector(".avatar");
  if (node) {
    node.replaceWith(avatar({ name: user.name || user.email, size: "sm" }));
  }
  const label = trigger.querySelector(".header-user-name");
  if (label) label.textContent = user.name || user.email;
}

export { escapeHtml, initials };
