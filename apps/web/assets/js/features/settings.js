/**
 * Settings: appearance, audio devices, telephony status, notifications,
 * account details and (for owners) plan/usage.
 */
import { THEMES, PERMISSIONS } from "../shared/index.js";
import { settingsApi, usersApi, extensionsApi, organisationsApi, billingApi, authApi } from "../core/endpoints.js";
import { handleError, applyFieldErrors } from "../core/error-handler.js";
import { setPageTitle, refreshHeaderUser } from "../core/app-shell.js";
import { getState, setState, subscribe } from "../core/state.js";
import { setTheme } from "../core/preferences.js";
import { STORAGE_KEYS } from "../core/config.js";
import { escapeHtml, loadJson, saveJson, clearChildren, formatDuration } from "../core/utils.js";
import { icon } from "../components/icons.js";
import { avatar, badge, emptyState, fieldGroup } from "../components/common.js";
import { confirmDialog, openDialog } from "../ui/dialogs.js";
import { createField } from "../ui/inputs.js";
import { notifySuccess, notifyWarning } from "../ui/notifications.js";
import * as audio from "../telephony/audio.js";
import * as telephony from "../telephony/call-manager.js";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: "sun" },
  { id: "audio", label: "Audio devices", icon: "headphones" },
  { id: "telephony", label: "Telephony", icon: "phoneCall" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "account", label: "Account", icon: "user" },
  { id: "organisation", label: "Organisation", icon: "building" },
  { id: "plan", label: "Plan & usage", icon: "creditCard", permission: PERMISSIONS.BILLING_READ },
  { id: "security", label: "Security", icon: "shield" },
];

export async function initSettings() {
  setPageTitle("Settings");
  renderLayout();
  await loadAll();
  window.addEventListener("hashchange", () => activateSection(location.hash.replace("#", "") || "appearance"));
  activateSection(location.hash.replace("#", "") || "appearance");
}

function renderLayout() {
  const root = document.querySelector("[data-settings-root]");
  if (!root) return;
  const permissions = getState().permissions || [];
  const navLinks = SECTIONS.filter((s) => !s.permission || permissions.includes(s.permission))
    .map((s) => `<a class="settings-nav-link" href="#${s.id}" data-section-link="${s.id}">${icon(s.icon, { size: 18 }).outerHTML}<span>${escapeHtml(s.label)}</span></a>`)
    .join("");

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Settings</h1>
        <p class="page-subtitle">Preferences apply to this browser and your account.</p>
      </div>
    </div>
    <div class="page-scroll">
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings sections">${navLinks}</nav>
        <div data-settings-panels>
          <section class="settings-section" data-panel="appearance"></section>
          <section class="settings-section" data-panel="audio"></section>
          <section class="settings-section" data-panel="telephony"></section>
          <section class="settings-section" data-panel="notifications"></section>
          <section class="settings-section" data-panel="account"></section>
          <section class="settings-section" data-panel="organisation"></section>
          <section class="settings-section" data-panel="plan"></section>
          <section class="settings-section" data-panel="security"></section>
        </div>
      </div>
    </div>`;
}

function activateSection(id) {
  const panels = document.querySelectorAll("[data-panel]");
  const target = document.querySelector(`[data-panel="${id}"]`) || document.querySelector('[data-panel="appearance"]');
  panels.forEach((p) => p.classList.toggle("hidden", p !== target));
  document.querySelectorAll("[data-section-link]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.sectionLink === id);
  });
}

async function loadAll() {
  renderAppearance();
  await renderAudio();
  await renderTelephony();
  await renderNotifications();
  await renderAccount();
  await renderOrganisation();
  await renderPlan();
  renderSecurity();
}

/* ---------------------------------------------------------------- appearance */

function renderAppearance() {
  const panel = document.querySelector('[data-panel="appearance"]');
  if (!panel) return;
  clearChildren(panel);
  panel.append(sectionHeader("Appearance", "Choose how CloudTel looks on this device."));

  const picker = document.createElement("div");
  picker.className = "theme-picker";
  for (const [value, label, cls] of [
    ["light", "Light", ""],
    ["dark", "Dark", "theme-swatch--dark"],
    ["system", "System", "theme-swatch--system"],
  ]) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `theme-option${(getState().theme || "system") === value ? " is-selected" : ""}`;
    option.dataset.themeOption = value;
    option.innerHTML = `
      <span class="theme-swatch ${cls}">
        <span class="theme-swatch-sidebar"></span>
        <span class="theme-swatch-body">
          <span class="theme-swatch-line is-accent"></span>
          <span class="theme-swatch-line"></span>
          <span class="theme-swatch-line"></span>
        </span>
      </span>
      <span class="theme-option-label">${label}</span>`;
    option.addEventListener("click", () => {
      setTheme(value);
      document.querySelectorAll("[data-theme-option]").forEach((o) => o.classList.toggle("is-selected", o.dataset.themeOption === value));
    });
    picker.append(option);
  }
  panel.append(fieldGroup("Theme", picker, { hint: "System follows your operating system setting." }));

  const compact = switchRow("Compact layout", getState().compactLayout, (checked) => saveUserSetting({ compactLayout: checked }));
  panel.append(compact);
}

/* --------------------------------------------------------------------- audio */

async function renderAudio() {
  const panel = document.querySelector('[data-panel="audio"]');
  if (!panel) return;
  clearChildren(panel);
  panel.append(sectionHeader("Audio devices", "Select the microphone and speaker CloudTel should use."));

  const granted = await audio.ensureMicrophoneAccess();
  if (!granted) {
    panel.append(notice("info", "Microphone access", "Grant microphone permission in your browser to place calls."));
  }
  const devices = await audio.listDevices();

  const grid = document.createElement("div");
  grid.className = "device-grid";
  grid.append(devicePreview("Microphone", audio.describeDevice(audio.getSelectedInput(), "input"), devices.inputs.length));
  grid.append(devicePreview("Speaker", audio.describeDevice(audio.getSelectedOutput(), "output"), devices.outputs.length));
  panel.append(grid);

  const micSelect = document.createElement("select");
  micSelect.className = "select";
  micSelect.id = "audio-input";
  for (const [i, device] of devices.inputs.entries()) {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${i + 1}`;
    option.selected = device.deviceId === audio.getSelectedInput();
    micSelect.append(option);
  }
  micSelect.addEventListener("change", async () => {
    audio.setSelectedInput(micSelect.value);
    await saveUserSetting({ inputDeviceId: micSelect.value });
  });
  panel.append(fieldGroup("Microphone", micSelect));

  if (devices.outputs.length) {
    const outSelect = document.createElement("select");
    outSelect.className = "select";
    outSelect.id = "audio-output";
    for (const [i, device] of devices.outputs.entries()) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Speaker ${i + 1}`;
      option.selected = device.deviceId === audio.getSelectedOutput();
      outSelect.append(option);
    }
    outSelect.addEventListener("change", async () => {
      audio.setSelectedOutput(outSelect.value);
      await saveUserSetting({ outputDeviceId: outSelect.value });
    });
    panel.append(fieldGroup("Speaker", outSelect, { hint: "Some browsers do not allow speaker selection." }));
  }

  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.className = "btn btn--secondary";
  testBtn.append(icon("volume", { size: 18 }));
  const testLabel = document.createElement("span");
  testLabel.textContent = "Test tone";
  testBtn.append(testLabel);
  testBtn.addEventListener("click", () => audio.playTone("ended"));
  panel.append(testBtn);
}

function devicePreview(label, value, count) {
  const node = document.createElement("div");
  node.className = "device-preview";
  node.append(icon(label === "Microphone" ? "mic" : "volume", { size: 28 }));
  const name = document.createElement("div");
  name.className = "device-preview-name";
  name.textContent = value;
  const kind = document.createElement("div");
  kind.className = "device-preview-kind";
  kind.textContent = `${label} · ${count} available`;
  node.append(name, kind);
  return node;
}

/* ----------------------------------------------------------------- telephony */

async function renderTelephony() {
  const panel = document.querySelector('[data-panel="telephony"]');
  if (!panel) return;
  clearChildren(panel);
  panel.append(sectionHeader("Telephony", "Your SIP registration and extension."));

  const banner = document.createElement("div");
  banner.className = "registration-banner";
  banner.dataset.settingsRegistration = "true";
  panel.append(banner);
  renderTelephonyState(banner, getState().registrationStatus);
  subscribe((patch) => {
    if ("registrationStatus" in patch) renderTelephonyState(banner, patch.registrationStatus);
  }, ["registrationStatus"]);

  let config = null;
  try {
    config = await settingsApi.telephony();
  } catch {
    /* handled below */
  }

  const rows = document.createElement("div");
  rows.className = "stack-sm";
  if (config?.configured) {
    rows.append(readonlyRow("SIP URI", config.sipUri || "—"));
    rows.append(readonlyRow("WebSocket server", config.wsUrl || "—"));
    rows.append(readonlyRow("Extension", config.extensionNumber || "—"));
  } else {
    rows.append(notice("warning", "Not configured", "An administrator must assign an extension before you can make calls."));
  }
  panel.append(rows);

  const actions = document.createElement("div");
  actions.className = "row";
  const reconnect = document.createElement("button");
  reconnect.type = "button";
  reconnect.className = "btn btn--primary";
  reconnect.append(icon("refresh", { size: 18 }));
  const reconnectLabel = document.createElement("span");
  reconnectLabel.textContent = "Reconnect";
  reconnect.append(reconnectLabel);
  reconnect.addEventListener("click", async () => {
    await telephony.unregister();
    const ok = await telephony.registerFromSettings();
    notifySuccess(ok ? "Reconnecting to the telephony service." : "Could not reconnect — check settings.");
  });
  actions.append(reconnect);
  panel.append(actions);
}

function renderTelephonyState(banner, status) {
  const map = {
    registered: { cls: "is-connected", text: "Connected" },
    registering: { cls: "is-registering", text: "Registering…" },
    connecting: { cls: "is-registering", text: "Connecting…" },
    registration_error: { cls: "is-error", text: "Registration error" },
    unregistered: { cls: "is-unregistered", text: "Not registered" },
    disconnected: { cls: "is-error", text: "Disconnected" },
    reconnecting: { cls: "is-registering", text: "Reconnecting…" },
  };
  const info = map[status] || map.unregistered;
  banner.className = `registration-banner ${info.cls}`;
  banner.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(info.text)}</span>`;
}

/* ------------------------------------------------------------- notifications */

async function renderNotifications() {
  const panel = document.querySelector('[data-panel="notifications"]');
  if (!panel) return;
  clearChildren(panel);
  panel.append(sectionHeader("Notifications", "Control how CloudTel alerts you."));

  let prefs = {};
  try {
    prefs = (await settingsApi.notifications()) || {};
  } catch {
    prefs = {};
  }

  panel.append(switchRow("Enable notifications", prefs.notificationsEnabled ?? true, (checked) => saveUserSetting({ notificationsEnabled: checked })));
  panel.append(switchRow("Incoming call sound", prefs.incomingCallSound ?? true, (checked) => saveUserSetting({ incomingCallSound: checked })));
  panel.append(switchRow("Dial pad tones", prefs.dialpadTones ?? loadJson(STORAGE_KEYS.DIALPAD_TONES, true), async (checked) => {
    saveJson(STORAGE_KEYS.DIALPAD_TONES, checked);
    await saveUserSetting({ dialpadTones: checked });
  }));
  panel.append(switchRow("Confirm before calling external numbers", prefs.confirmOutboundCalls ?? false, (checked) => saveUserSetting({ confirmOutboundCalls: checked })));

  const timezone = document.createElement("select");
  timezone.className = "select";
  timezone.id = "settings-timezone";
  for (const zone of ["Africa/Johannesburg", "Africa/Lagos", "Europe/London", "Europe/Berlin", "America/New_York", "UTC"]) {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = zone;
    option.selected = (prefs.timezone || getState().timezone) === zone;
    timezone.append(option);
  }
  timezone.addEventListener("change", () => {
    setState({ timezone: timezone.value });
    saveUserSetting({ timezone: timezone.value });
  });
  panel.append(fieldGroup("Timezone", timezone, { hint: "Used to display call times." }));
}

/* ------------------------------------------------------------------- account */

async function renderAccount() {
  const panel = document.querySelector('[data-panel="account"]');
  if (!panel) return;
  clearChildren(panel);
  const user = getState().user || {};
  panel.append(sectionHeader("Account", "Your profile and sign-in details."));

  const hero = document.createElement("div");
  hero.className = "row";
  hero.append(avatar({ name: user.name || user.email, size: "lg" }));
  const info = document.createElement("div");
  info.innerHTML = `
    <div class="contact-detail-name">${escapeHtml(user.name || "—")}</div>
    <div class="text-sm text-muted">${escapeHtml(user.email || "")}</div>`;
  hero.append(info);
  panel.append(hero);

  const nameField = createField({ label: "Full name", value: user.name || "", autocomplete: "name" });
  const emailField = createField({ label: "Email", type: "email", value: user.email || "", attrs: { disabled: "disabled" } });
  const form = document.createElement("div");
  form.className = "settings-form";
  form.append(nameField.element, emailField.element);
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn--primary";
  const saveLabel = document.createElement("span");
  saveLabel.textContent = "Save profile";
  saveBtn.append(saveLabel);
  saveBtn.addEventListener("click", async () => {
    try {
      const updated = await usersApi.updateMe({ name: nameField.getValue().trim() });
      setState({ user: { ...user, ...updated } });
      refreshHeaderUser();
      notifySuccess("Profile updated.");
    } catch (error) {
      const info2 = handleError(error);
      applyFieldErrors(info2.fields, { name: nameField });
    }
  });
  form.append(saveBtn);
  panel.append(form);

  panel.append(sectionHeader("Password", "Change your sign-in password."));
  const currentField = createField({ label: "Current password", type: "password", togglePassword: true, autocomplete: "current-password" });
  const newField = createField({ label: "New password", type: "password", togglePassword: true, autocomplete: "new-password", hint: "At least 10 characters." });
  const confirmField = createField({ label: "Confirm new password", type: "password", togglePassword: true, autocomplete: "new-password" });
  const pwForm = document.createElement("div");
  pwForm.className = "settings-form";
  pwForm.append(currentField.element, newField.element, confirmField.element);
  const pwBtn = document.createElement("button");
  pwBtn.type = "button";
  pwBtn.className = "btn btn--primary";
  const pwLabel = document.createElement("span");
  pwLabel.textContent = "Update password";
  pwBtn.append(pwLabel);
  pwBtn.addEventListener("click", async () => {
    if (newField.getValue() !== confirmField.getValue()) {
      confirmField.setError("Passwords do not match.");
      return;
    }
    try {
      await authApi.changePassword({ currentPassword: currentField.getValue(), newPassword: newField.getValue() });
      notifySuccess("Password updated.");
      currentField.setValue("");
      newField.setValue("");
      confirmField.setValue("");
    } catch (error) {
      const info2 = handleError(error);
      applyFieldErrors(info2.fields, { currentPassword: currentField, newPassword: newField });
    }
  });
  pwForm.append(pwBtn);
  panel.append(pwForm);

  panel.append(sectionHeader("Active sessions", "Devices currently signed in to your account."));
  try {
    const result = await usersApi.sessions();
    const sessions = result?.items || result || [];
    const list = document.createElement("div");
    list.className = "stack-sm";
    for (const session of sessions) {
      const row = document.createElement("div");
      row.className = "row-between card";
      row.style.padding = "12px 16px";
      row.innerHTML = `<div><div class="font-medium">${escapeHtml(session.userAgent || "Unknown device")}</div><div class="text-xs text-muted">${escapeHtml(session.ip || "")} · ${escapeHtml(session.createdAt || "")}</div></div>`;
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "btn btn--danger-outline btn--sm";
      const revokeLabel = document.createElement("span");
      revokeLabel.textContent = "Revoke";
      revoke.append(revokeLabel);
      revoke.addEventListener("click", async () => {
        try {
          await usersApi.revokeSession(session.id);
          notifySuccess("Session revoked.");
          renderAccount();
        } catch (error) {
          handleError(error);
        }
      });
      row.append(revoke);
      list.append(row);
    }
    if (!sessions.length) list.append(emptyState({ icon: "monitor", title: "No other sessions", message: "You are only signed in here." }));
    panel.append(list);
  } catch {
    /* sessions listing is optional */
  }
}

/* -------------------------------------------------------------- organisation */

async function renderOrganisation() {
  const panel = document.querySelector('[data-panel="organisation"]');
  if (!panel) return;
  clearChildren(panel);
  panel.append(sectionHeader("Organisation", "Details for your current organisation."));

  let org = null;
  const canManage = (getState().permissions || []).includes(PERMISSIONS.ORG_MANAGE);
  try {
    org = await organisationsApi.current();
  } catch {
    org = null;
  }

  if (!org) {
    panel.append(emptyState({ icon: "building", title: "No organisation", message: "Contact your administrator." }));
    return;
  }

  const nameField = createField({ label: "Organisation name", value: org.name || "", attrs: canManage ? {} : { disabled: "disabled" } });
  const form = document.createElement("div");
  form.className = "settings-form";
  form.append(nameField.element);
  if (canManage) {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn--primary";
    const label = document.createElement("span");
    label.textContent = "Save organisation";
    save.append(label);
    save.addEventListener("click", async () => {
      try {
        await organisationsApi.update({ name: nameField.getValue().trim() });
        notifySuccess("Organisation updated.");
      } catch (error) {
        handleError(error);
      }
    });
    form.append(save);
  }
  panel.append(form);

  const mine = await organisationsApi.listMine().catch(() => []);
  const memberships = mine?.items || mine || [];
  if (memberships.length > 1) {
    panel.append(sectionHeader("Switch organisation", "You belong to more than one organisation."));
    const list = document.createElement("div");
    list.className = "stack-sm";
    for (const membership of memberships) {
      const row = document.createElement("div");
      row.className = "row-between card";
      row.style.padding = "12px 16px";
      row.innerHTML = `<div><div class="font-medium">${escapeHtml(membership.organisationName || membership.name)}</div><div class="text-xs text-muted">${escapeHtml(membership.role || "")}</div></div>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--secondary btn--sm";
      const label = document.createElement("span");
      label.textContent = "Switch";
      btn.append(label);
      btn.addEventListener("click", async () => {
        try {
          await organisationsApi.switch(membership.organisationId);
          window.location.reload();
        } catch (error) {
          handleError(error);
        }
      });
      row.append(btn);
      list.append(row);
    }
    panel.append(list);
  }
}

/* --------------------------------------------------------------- plan/usage */

async function renderPlan() {
  const panel = document.querySelector('[data-panel="plan"]');
  if (!panel) return;
  clearChildren(panel);
  if (!(getState().permissions || []).includes(PERMISSIONS.BILLING_READ)) return;

  panel.append(sectionHeader("Plan & usage", "Your subscription and consumption this month."));
  try {
    const plan = await billingApi.plan();
    const usage = await billingApi.usage();

    const card = document.createElement("div");
    card.className = "plan-card is-current";
    card.innerHTML = `
      <div>
        <div class="plan-name">${escapeHtml(plan.current?.plan || "Trial")}</div>
        <div class="text-sm text-muted">Status: ${escapeHtml(plan.current?.status || "active")}</div>
      </div>
      <span class="badge badge--primary">${plan.enabled ? "Billing active" : "Billing disabled"}</span>`;
    panel.append(card);

    const meters = document.createElement("div");
    meters.className = "stack";
    meters.append(usageMeter("Calls this month", usage.metrics?.callsCount || 0, null));
    meters.append(usageMeter("Talk time", formatDuration(usage.metrics?.callSeconds || 0), null));
    meters.append(usageMeter("Billable time", formatDuration(usage.metrics?.billableSeconds || 0), null));
    panel.append(meters);

    if (plan.enabled) {
      const actions = document.createElement("div");
      actions.className = "row";
      for (const option of plan.catalogue || []) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn--secondary";
        const label = document.createElement("span");
        label.textContent = `Choose ${option.name}`;
        btn.append(label);
        btn.addEventListener("click", async () => {
          try {
            const session = await billingApi.checkout(option.id);
            if (session?.url) window.location.assign(session.url);
          } catch (error) {
            handleError(error);
          }
        });
        actions.append(btn);
      }
      panel.append(actions);
    } else {
      panel.append(notice("info", "Billing disabled", "No payment provider is configured for this deployment."));
    }
  } catch (error) {
    panel.append(emptyState({ icon: "creditCard", title: "Plan unavailable", message: error?.message || "" }));
  }
}

function usageMeter(label, value, max) {
  const node = document.createElement("div");
  node.className = "usage-meter";
  const ratio = max ? Math.min(1, value / max) : 0;
  node.innerHTML = `
    <div class="usage-meter-label"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(value))}</span></div>
    <div class="usage-meter-bar"><div class="usage-meter-fill${ratio > 0.9 ? " is-danger" : ratio > 0.75 ? " is-warning" : ""}" style="width:${max ? Math.round(ratio * 100) : 100}%"></div></div>`;
  return node;
}

/* ------------------------------------------------------------------ security */

function renderSecurity() {
  const panel = document.querySelector('[data-panel="security"]');
  if (!panel) return;
  clearChildren(panel);
  panel.append(sectionHeader("Security", "Session and account protection."));
  panel.append(notice("info", "Session", "CloudTel stores sessions in HttpOnly cookies protected by a CSRF token. SIP passwords never reach the browser."));

  const signOutAll = document.createElement("button");
  signOutAll.type = "button";
  signOutAll.className = "btn btn--danger-outline";
  signOutAll.append(icon("logOut", { size: 18 }));
  const label = document.createElement("span");
  label.textContent = "Sign out everywhere";
  signOutAll.append(label);
  signOutAll.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Sign out everywhere", message: "Revoke all sessions except this one?", confirmLabel: "Sign out others" });
    if (ok) notifyWarning("All other sessions will be revoked on your next action.");
  });
  panel.append(signOutAll);
}

/* -------------------------------------------------------------------- utils */

function sectionHeader(title, description) {
  const wrap = document.createElement("div");
  const h = document.createElement("h2");
  h.className = "settings-section-title";
  h.textContent = title;
  const p = document.createElement("p");
  p.className = "settings-section-desc";
  p.textContent = description;
  wrap.append(h, p);
  return wrap;
}

function switchRow(label, checked, onChange) {
  const row = document.createElement("div");
  row.className = "switch-row";
  const text = document.createElement("span");
  text.textContent = label;
  const control = document.createElement("label");
  control.className = "switch";
  control.innerHTML = `<input type="checkbox"${checked ? " checked" : ""} /><span class="switch-track"></span><span class="switch-thumb"></span>`;
  const input = control.querySelector("input");
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => onChange(input.checked));
  row.append(text, control);
  return row;
}

function readonlyRow(label, value) {
  const row = document.createElement("div");
  row.className = "row-between";
  row.innerHTML = `<span class="text-muted">${escapeHtml(label)}</span><span class="mono text-sm">${escapeHtml(value)}</span>`;
  return row;
}

function notice(tone, title, message) {
  const node = document.createElement("div");
  node.className = `card`;
  node.style.padding = "12px 16px";
  node.style.marginTop = "12px";
  node.innerHTML = `<div class="row" style="gap:8px"><span class="badge badge--${tone}">${escapeHtml(title)}</span></div><p class="text-sm" style="margin-top:6px">${escapeHtml(message)}</p>`;
  return node;
}

async function saveUserSetting(patch) {
  try {
    await settingsApi.update(patch);
    if (patch.compactLayout !== undefined) setState({ compactLayout: patch.compactLayout });
    if (patch.timezone) setState({ timezone: patch.timezone });
    notifySuccess("Preference saved.");
  } catch (error) {
    handleError(error);
  }
}
