/**
 * Call history: grouped, filterable list of calls with dispositions,
 * click-to-call, detail and CSV export.
 */
import { CALL_DISPOSITIONS, DISPOSITION_GROUPS } from "../shared/index.js";
import { dispositionGroup, formatPhoneNumber } from "../shared/index.js";
import { callsApi } from "../core/endpoints.js";
import { handleError } from "../core/error-handler.js";
import { setPageTitle } from "../core/app-shell.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatDuration, formatTime, dayLabel, debounce, clearChildren } from "../core/utils.js";
import { icon } from "../components/icons.js";
import { emptyState, loadingRows, statusBadge } from "../components/common.js";
import { openDialog } from "../ui/dialogs.js";
import { startCall } from "./dialer.js";

const FILTERS = [
  { id: "all", label: "All calls" },
  { id: "missed", label: "Missed" },
  { id: "answered", label: "Answered" },
  { id: "outgoing", label: "Outgoing" },
  { id: "incoming", label: "Incoming" },
];

const DISPOSITION_TONES = {
  [CALL_DISPOSITIONS.ANSWERED]: "success",
  [CALL_DISPOSITIONS.MISSED]: "danger",
  [CALL_DISPOSITIONS.NO_ANSWER]: "warning",
  [CALL_DISPOSITIONS.DECLINED]: "warning",
  [CALL_DISPOSITIONS.BUSY]: "warning",
  [CALL_DISPOSITIONS.FAILED]: "danger",
  [CALL_DISPOSITIONS.CANCELLED]: "neutral",
  [CALL_DISPOSITIONS.VOICEMAIL]: "info",
};

let activeFilter = "all";
let searchQuery = "";

export async function initHistory() {
  setPageTitle("Call history");
  renderLayout();
  wireControls();
  await loadHistory();
}

function renderLayout() {
  const root = document.querySelector("[data-history-root]");
  if (!root) return;
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Call history</h1>
        <p class="page-subtitle">Every call you place and receive, with its outcome.</p>
      </div>
      <button type="button" class="btn btn--secondary" data-history-export>
        ${icon("download", { size: 18 }).outerHTML}<span>Export CSV</span>
      </button>
    </div>
    <div class="page-scroll">
      <div class="history-filters">
        <div class="input-group">
          <span class="input-group-icon">${icon("search", { size: 18 }).outerHTML}</span>
          <input class="input" type="search" placeholder="Search by name or number…" data-history-search aria-label="Search call history" />
        </div>
        <div class="segmented" data-history-filters role="group" aria-label="Filter calls"></div>
      </div>
      <div data-history-list></div>
    </div>`;

  const filters = root.querySelector("[data-history-filters]");
  for (const filter of FILTERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = filter.label;
    btn.setAttribute("aria-pressed", filter.id === activeFilter ? "true" : "false");
    btn.dataset.filter = filter.id;
    filters.append(btn);
  }
}

function wireControls() {
  const search = document.querySelector("[data-history-search]");
  search?.addEventListener("input", debounce(() => {
    searchQuery = search.value.trim();
    loadHistory();
  }, 300));

  document.querySelector("[data-history-filters]")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-filter]");
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    document.querySelectorAll("[data-history-filters] button").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.filter === activeFilter ? "true" : "false");
    });
    loadHistory();
  });

  document.querySelector("[data-history-export]")?.addEventListener("click", exportCsv);
}

async function loadHistory() {
  const list = document.querySelector("[data-history-list]");
  if (!list) return;
  clearChildren(list);
  list.append(loadingRows(8));

  const query = { pageSize: 50 };
  if (searchQuery) query.q = searchQuery;
  if (activeFilter === "incoming" || activeFilter === "outgoing") query.direction = activeFilter;
  if (activeFilter === "missed") query.disposition = DISPOSITION_GROUPS.missed.join(",");
  if (activeFilter === "answered") query.disposition = CALL_DISPOSITIONS.ANSWERED;

  try {
    const result = await callsApi.list(query);
    const items = result?.items || result || [];
    renderHistory(items);
  } catch (error) {
    list.replaceChildren(emptyState({ icon: "alertCircle", title: "Could not load call history", message: error?.message || "" }));
  }
}

function renderHistory(items) {
  const list = document.querySelector("[data-history-list]");
  if (!list) return;
  clearChildren(list);

  if (!items.length) {
    list.append(emptyState({ icon: "history", title: "No calls found", message: "Calls matching your filters will appear here." }));
    return;
  }

  const container = document.createElement("div");
  container.className = "history-list";

  let lastDay = null;
  for (const call of items) {
    const day = dayLabel(call.startedAt || call.createdAt, getState().timezone);
    if (day !== lastDay) {
      const label = document.createElement("div");
      label.className = "history-day-label";
      label.textContent = day;
      container.append(label);
      lastDay = day;
    }
    container.append(historyRow(call));
  }
  list.append(container);
}

function historyRow(call) {
  const row = document.createElement("div");
  row.className = "history-row";

  const group = dispositionGroup(call.disposition);
  const dirIcon =
    call.direction === "incoming"
      ? group === "missed" || group === "declined"
        ? "phoneMissed"
        : "phoneIncoming"
      : "phoneOutgoing";
  const dirWrap = document.createElement("span");
  dirWrap.className = `history-direction is-${group === "missed" || group === "declined" ? "missed" : call.direction}`;
  dirWrap.append(icon(dirIcon, { size: 16 }));

  const info = document.createElement("div");
  info.className = "history-info";
  const name = call.displayName || call.callerName || formatPhoneNumber(call.remoteNumber || call.callerNumber || call.calleeNumber || "");
  const tone = DISPOSITION_TONES[call.disposition] || "neutral";
  info.innerHTML = `
    <div class="history-name">${escapeHtml(name)}</div>
    <div class="history-meta">
      <span class="badge badge--${tone}">${escapeHtml(prettyDisposition(call.disposition))}</span>
      <span>${escapeHtml(formatTime(call.startedAt || call.createdAt, getState().timezone))}</span>
    </div>`;

  const duration = document.createElement("span");
  duration.className = "history-duration";
  duration.textContent = call.durationSeconds ? formatDuration(call.durationSeconds) : "—";

  const actions = document.createElement("div");
  actions.className = "history-actions";
  const callBtn = document.createElement("button");
  callBtn.type = "button";
  callBtn.className = "btn btn--ghost btn--icon btn--sm";
  callBtn.setAttribute("aria-label", "Call back");
  callBtn.append(icon("phoneCall", { size: 16 }));
  callBtn.addEventListener("click", () => {
    const target = call.remoteNumber || call.callerNumber || call.calleeNumber;
    startCallWith(target, call.displayName || call.callerName);
  });

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "btn btn--ghost btn--icon btn--sm";
  infoBtn.setAttribute("aria-label", "Call details");
  infoBtn.append(icon("info", { size: 16 }));
  infoBtn.addEventListener("click", () => showDetails(call));

  actions.append(callBtn, infoBtn);

  row.append(dirWrap, info, duration, actions);
  return row;
}

function prettyDisposition(disposition) {
  return String(disposition || "unknown").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function startCallWith(target, name) {
  window.location.href = `/dialer.html?call=${encodeURIComponent(target || "")}&name=${encodeURIComponent(name || "")}`;
}

function showDetails(call) {
  const body = document.createElement("div");
  body.className = "stack";
  const rows = [
    ["Direction", call.direction],
    ["Disposition", prettyDisposition(call.disposition)],
    ["From", call.callerName || formatPhoneNumber(call.callerNumber || "")],
    ["To", call.calleeNumber || call.remoteNumber || ""],
    ["Started", formatTime(call.startedAt, getState().timezone)],
    ["Duration", call.durationSeconds ? formatDuration(call.durationSeconds) : "—"],
    ["Billable", call.billableSeconds ? formatDuration(call.billableSeconds) : "—"],
    ["Hangup cause", call.hangupCause || "—"],
  ];
  for (const [label, value] of rows) {
    const line = document.createElement("div");
    line.className = "row-between";
    line.innerHTML = `<span class="text-muted">${escapeHtml(label)}</span><span>${escapeHtml(String(value ?? "—"))}</span>`;
    body.append(line);
  }
  openDialog({ title: "Call details", body: [body], actions: [{ label: "Close", variant: "secondary", value: "close" }] });
}

async function exportCsv() {
  try {
    const result = await callsApi.export({ q: searchQuery || undefined });
    const csv = typeof result === "string" ? result : result?.csv || "";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cloudtel-call-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    handleError(error);
  }
}
