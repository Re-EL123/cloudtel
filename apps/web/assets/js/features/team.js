/**
 * Team directory: the organisation's extensions, presence and click-to-call.
 * Visible to every member; management actions are permission-gated.
 */
import { EXTENSION_STATUSES, PROVISIONING_STATES, PERMISSIONS } from "../shared/index.js";
import { extensionsApi } from "../core/endpoints.js";
import { handleError } from "../core/error-handler.js";
import { setPageTitle } from "../core/app-shell.js";
import { getState } from "../core/state.js";
import { escapeHtml, debounce, clearChildren } from "../core/utils.js";
import { icon } from "../components/icons.js";
import { avatar, badge, emptyState, loadingRows, statusBadge } from "../components/common.js";
import { openDialog } from "../ui/dialogs.js";
import { createField, createSelectField } from "../ui/inputs.js";
import { notifySuccess } from "../ui/notifications.js";

let extensions = [];
let searchQuery = "";

export async function initTeam() {
  setPageTitle("Team");
  renderLayout();
  await loadTeam();
}

function renderLayout() {
  const root = document.querySelector("[data-team-root]");
  if (!root) return;
  const canManage = canManageExtensions();
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Team</h1>
        <p class="page-subtitle">Extensions across your organisation.</p>
      </div>
      <div class="row">
        ${canManage ? `<button type="button" class="btn btn--primary" data-team-new>${icon("plus", { size: 18 }).outerHTML}<span>Add extension</span></button>` : ""}
        <button type="button" class="btn btn--secondary" data-team-refresh>${icon("refresh", { size: 18 }).outerHTML}<span>Refresh</span></button>
      </div>
    </div>
    <div class="page-scroll">
      <div class="toolbar toolbar-search">
        <div class="input-group">
          <span class="input-group-icon">${icon("search", { size: 18 }).outerHTML}</span>
          <input class="input" type="search" placeholder="Search by name or extension…" data-team-search aria-label="Search team" />
        </div>
      </div>
      <div data-team-list></div>
    </div>`;
  root.querySelector("[data-team-refresh]")?.addEventListener("click", loadTeam);
  root.querySelector("[data-team-new]")?.addEventListener("click", () => openExtensionForm(null));
  root.querySelector("[data-team-search]")?.addEventListener("input", debounce((event) => {
    searchQuery = event.target.value.trim().toLowerCase();
    renderList();
  }, 200));
}

async function loadTeam() {
  const list = document.querySelector("[data-team-list]");
  if (!list) return;
  clearChildren(list);
  list.append(loadingRows(6));
  try {
    const result = await extensionsApi.list({ pageSize: 100 });
    extensions = result?.items || result || [];
    renderList();
  } catch (error) {
    list.replaceChildren(emptyState({ icon: "alertCircle", title: "Could not load the team", message: error?.message || "" }));
  }
}

function renderList() {
  const list = document.querySelector("[data-team-list]");
  if (!list) return;
  clearChildren(list);

  const filtered = extensions.filter((ext) => {
    if (!searchQuery) return true;
    return `${ext.displayName} ${ext.number} ${ext.userName || ""}`.toLowerCase().includes(searchQuery);
  });

  if (!filtered.length) {
    list.append(emptyState({ icon: "grid3x3", title: "No extensions", message: "Nothing matched your search." }));
    return;
  }

  const grid = document.createElement("div");
  grid.className = "team-grid";
  for (const ext of filtered) {
    grid.append(teamCard(ext));
  }
  list.append(grid);
}

function teamCard(ext) {
  const card = document.createElement("div");
  card.className = "team-card";
  card.append(avatar({ name: ext.displayName || ext.userName || ext.number, src: ext.avatarUrl }));

  const info = document.createElement("div");
  info.className = "team-card-info";
  info.innerHTML = `
    <div class="team-card-name">${escapeHtml(ext.displayName || ext.userName || "Unnamed")}</div>
    <div class="team-card-meta">Ext. ${escapeHtml(ext.number)}${ext.userEmail ? ` · ${escapeHtml(ext.userEmail)}` : ""}</div>`;

  const badges = document.createElement("div");
  badges.className = "team-card-badges";
  badges.append(statusBadge(ext.status, ext.status === EXTENSION_STATUSES.ACTIVE ? "success" : "neutral"));
  const provTone = ext.provisioningStatus === PROVISIONING_STATES.READY ? "info" : ext.provisioningStatus === PROVISIONING_STATES.FAILED ? "danger" : "warning";
  badges.append(badge(ext.provisioningStatus || "pending", provTone));
  info.append(badges);
  card.append(info);

  const actions = document.createElement("div");
  actions.className = "team-card-actions";
  const callBtn = iconBtn("phoneCall", "Call extension", () => callExtension(ext));
  actions.append(callBtn);
  if (canManageExtensions()) {
    actions.append(iconBtn("edit", "Edit extension", () => openExtensionForm(ext)));
    actions.append(iconBtn("key", "Rotate credentials", () => rotateCredentials(ext)));
  }
  card.append(actions);
  return card;
}

function iconBtn(iconName, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--ghost btn--icon btn--sm";
  btn.setAttribute("aria-label", label);
  btn.append(icon(iconName, { size: 16 }));
  btn.addEventListener("click", onClick);
  return btn;
}

function callExtension(ext) {
  window.location.href = `/dialer.html?call=${encodeURIComponent(ext.number)}&name=${encodeURIComponent(ext.displayName || ext.userName || "")}`;
}

function openExtensionForm(ext) {
  const isEdit = Boolean(ext);
  const fields = {
    number: createField({ label: "Extension number", value: ext?.number || "", required: true, hint: "2–12 characters, e.g. 1004" }),
    displayName: createField({ label: "Display name", value: ext?.displayName || "", required: true }),
  };
  const statusField = createSelectField({
    label: "Status",
    value: ext?.status || "active",
    options: [
      { value: "active", label: "Active" },
      { value: "disabled", label: "Disabled" },
      { value: "revoked", label: "Revoked" },
    ],
  });

  const body = document.createElement("div");
  body.className = "stack";
  body.append(fields.number.element, fields.displayName.element, statusField.element);

  openDialog({
    title: isEdit ? `Edit extension ${ext.number}` : "Add extension",
    body: [body],
    actions: [
      { label: "Cancel", variant: "secondary", value: "cancel" },
      { label: isEdit ? "Save" : "Create", variant: "primary", value: "save", autofocus: true },
    ],
  }).promise.then(async (value) => {
    if (value !== "save") return;
    const payload = {
      number: fields.number.getValue().trim(),
      displayName: fields.displayName.getValue().trim(),
      status: statusField.getValue(),
    };
    try {
      if (isEdit) await extensionsApi.update(ext.id, payload);
      else await extensionsApi.create(payload);
      notifySuccess(isEdit ? "Extension updated." : "Extension created.");
      await loadTeam();
    } catch (error) {
      const info = handleError(error);
      if (info.fields) {
        for (const [field, message] of Object.entries(info.fields)) fields[field]?.setError?.(message);
      }
    }
  });
}

async function rotateCredentials(ext) {
  const allowed = window.confirm(
    `Rotate SIP credentials for extension ${ext.number}? The current password will stop working immediately.`
  );
  if (!allowed) return;
  try {
    await extensionsApi.rotateCredentials(ext.id);
    notifySuccess("Credentials rotated.");
  } catch (error) {
    handleError(error);
  }
}

function canManageExtensions() {
  const permissions = getState().permissions || [];
  return permissions.includes(PERMISSIONS.EXTENSIONS_MANAGE) || permissions.includes(PERMISSIONS.ADMIN_DASHBOARD);
}
