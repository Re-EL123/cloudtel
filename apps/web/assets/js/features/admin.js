/**
 * Administration console: organisation dashboard, usage and the audit trail.
 * Every action is re-authorised and audited server side.
 */
import { PERMISSIONS } from "../shared/index.js";
import { adminApi } from "../core/endpoints.js";
import { handleError } from "../core/error-handler.js";
import { setPageTitle } from "../core/app-shell.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatDateTime, formatDuration, clearChildren } from "../core/utils.js";
import { icon } from "../components/icons.js";
import { emptyState, loadingRows } from "../components/common.js";
import { notifySuccess } from "../ui/notifications.js";

let activeTab = "overview";

const TABS = [
  { id: "overview", label: "Overview", permission: PERMISSIONS.ADMIN_DASHBOARD },
  { id: "usage", label: "Usage", permission: PERMISSIONS.ADMIN_USAGE },
  { id: "audit", label: "Audit log", permission: PERMISSIONS.ADMIN_AUDIT },
];

function permittedTabs() {
  const permissions = getState().permissions || [];
  return TABS.filter((tab) => permissions.includes(tab.permission));
}

export async function initAdmin() {
  setPageTitle("Administration");
  const tabs = permittedTabs();
  if (!tabs.length) {
    const root = document.querySelector("[data-admin-root]");
    if (root) root.replaceChildren(emptyState({ icon: "shield", title: "No access", message: "You do not have administrative permissions." }));
    return;
  }
  if (!tabs.some((tab) => tab.id === activeTab)) activeTab = tabs[0].id;
  renderLayout(tabs);
  await renderTab(activeTab);
}

function renderLayout(tabs) {
  const root = document.querySelector("[data-admin-root]");
  if (!root) return;
  const tabButtons = tabs
    .map((t) => `<button type="button" class="tab" data-admin-tab="${t.id}" aria-selected="${t.id === activeTab}">${escapeHtml(t.label)}</button>`)
    .join("");
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Administration</h1>
        <p class="page-subtitle">Organisation management and insights.</p>
      </div>
      <button type="button" class="btn btn--secondary" data-admin-refresh>${icon("refresh", { size: 18 }).outerHTML}<span>Refresh</span></button>
    </div>
    <div class="tabs" role="tablist">${tabButtons}</div>
    <div class="page-scroll" data-admin-content></div>`;

  root.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.adminTab;
      root.querySelectorAll("[data-admin-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.adminTab === activeTab)));
      renderTab(activeTab);
    });
  });
  root.querySelector("[data-admin-refresh]")?.addEventListener("click", () => renderTab(activeTab));
}

async function renderTab(tab) {
  const content = document.querySelector("[data-admin-content]");
  if (!content) return;
  clearChildren(content);
  content.append(loadingRows(4));
  try {
    if (tab === "overview") await renderOverview(content);
    else if (tab === "usage") await renderUsage(content);
    else if (tab === "audit") await renderAudit(content);
  } catch (error) {
    const info = handleError(error, { silent: true });
    content.replaceChildren(emptyState({ icon: "alertCircle", title: "Could not load", message: info.message || "" }));
  }
}

async function renderOverview(content) {
  const data = (await adminApi.dashboard()) || {};
  const grid = document.createElement("div");
  grid.className = "admin-stats";
  const stats = [
    ["Members", data.members?.active ?? "—", `${data.members?.total ?? "—"} total`],
    ["Extensions", data.extensions?.active ?? "—", `${data.extensions?.ready ?? "—"} ready`],
    ["Calls today", data.callsToday?.total ?? "—", `${data.callsToday?.missed ?? "—"} missed`],
    ["Calls this month", data.callsThisMonth?.total ?? "—", "Since the 1st"],
    ["Missed today", data.missedToday ?? "—", "Needs attention"],
    ["Talk time (month)", data.minutesThisMonth != null ? `${data.minutesThisMonth} min` : "—", "Answered duration"],
  ];
  for (const [label, value, hint] of stats) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(String(value))}</div><div class="stat-hint">${escapeHtml(hint)}</div>`;
    grid.append(card);
  }
  content.replaceChildren(grid);

  const recent = data.recentActivity || [];
  if (recent.length) {
    const section = document.createElement("section");
    section.className = "card";
    section.innerHTML = `<h2 class="card-title">Recent activity</h2>`;
    const list = document.createElement("ul");
    list.className = "activity-list";
    for (const entry of recent) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="badge badge--neutral">${escapeHtml(entry.action)}</span>
        <span class="text-sm">${escapeHtml(entry.resourceType || "")}${entry.resourceId ? `:${escapeHtml(String(entry.resourceId).slice(0, 8))}` : ""}</span>
        <span class="text-xs text-muted grow">${escapeHtml(formatDateTime(entry.createdAt))}</span>`;
      list.append(li);
    }
    section.append(list);
    content.append(section);
  }
}

async function renderUsage(content) {
  const data = (await adminApi.usage({ days: 30 })) || {};
  const daily = data.daily || [];
  const byUser = data.byUser || [];

  const summary = document.createElement("div");
  summary.className = "admin-stats";
  const totalCalls = daily.reduce((sum, d) => sum + (d.calls || 0), 0);
  const totalBillable = daily.reduce((sum, d) => sum + (d.billableSeconds || 0), 0);
  for (const [label, value, hint] of [
    ["Period", `${data.periodDays || 30} days`, "Rolling window"],
    ["Calls", totalCalls, "Total in period"],
    ["Billable time", formatDuration(totalBillable), "Billable seconds"],
  ]) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(String(value))}</div><div class="stat-hint">${escapeHtml(hint)}</div>`;
    summary.append(card);
  }
  content.replaceChildren(summary);

  if (byUser.length) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `<thead><tr><th>User</th><th>Email</th><th>Calls</th><th>Talk time</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const row of byUser) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="font-medium">${escapeHtml(row.name || "—")}</td>
        <td class="text-sm text-muted">${escapeHtml(row.email || "")}</td>
        <td>${escapeHtml(String(row.calls ?? 0))}</td>
        <td>${escapeHtml(formatDuration(row.durationSeconds || 0))}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    content.append(wrap);
  } else {
    content.append(emptyState({ icon: "barChart", title: "No usage yet", message: "Usage will appear after calls are placed." }));
  }
}

async function renderAudit(content) {
  const result = await adminApi.auditLogs({ pageSize: 50 });
  const items = Array.isArray(result) ? result : result?.items || [];
  if (!items.length) {
    content.replaceChildren(emptyState({ icon: "history", title: "No audit entries", message: "Administrative actions will appear here." }));
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.className = "table";
  table.innerHTML = `<thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Metadata</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  for (const entry of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-sm text-muted">${escapeHtml(formatDateTime(entry.createdAt))}</td>
      <td>${escapeHtml(entry.userName || entry.userEmail || entry.userId || "system")}</td>
      <td><span class="badge badge--neutral">${escapeHtml(entry.action)}</span></td>
      <td class="text-sm">${escapeHtml(entry.resourceType || "")}${entry.resourceId ? `:${escapeHtml(String(entry.resourceId).slice(0, 8))}` : ""}</td>
      <td><div class="audit-meta" title="${escapeHtml(JSON.stringify(entry.metadata || {}))}">${escapeHtml(JSON.stringify(entry.metadata || {}))}</div></td>`;
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  content.replaceChildren(wrap);
}

export async function suspendUser(userId) {
  try {
    await adminApi.suspendUser(userId);
    notifySuccess("User suspended.");
  } catch (error) {
    handleError(error);
  }
}
