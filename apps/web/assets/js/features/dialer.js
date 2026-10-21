/**
 * Dialer feature: keypad, number entry with contact matching, call controls
 * and the recents context panel. All telephony goes through call-manager.
 */
import { CALL_STATES } from "../shared/index.js";
import { emit, on } from "../core/event-bus.js";
import { getState, setState, subscribe } from "../core/state.js";
import { contactsApi, callsApi } from "../core/endpoints.js";
import { handleError } from "../core/error-handler.js";
import { setPageTitle } from "../core/app-shell.js";
import { escapeHtml, formatDuration, formatPhone, loadJson, saveJson, debounce, clearChildren } from "../core/utils.js";
import { STORAGE_KEYS } from "../core/config.js";
import { icon } from "../components/icons.js";
import { avatar, emptyState } from "../components/common.js";
import * as calls from "../telephony/call-manager.js";
import { notifyInfo } from "../ui/notifications.js";

const KEYPAD = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
];

let numberBuffer = "";
let inputEl = null;
let controlsEl = null;
let timerEl = null;
let statusEl = null;
let matchEl = null;

export function initDialer() {
  setPageTitle("Dialer");
  inputEl = document.querySelector("[data-dial-input]");
  controlsEl = document.querySelector("[data-call-controls]");
  statusEl = document.querySelector("[data-call-status]");
  timerEl = document.querySelector("[data-call-timer]");
  matchEl = document.querySelector("[data-dial-match]");

  renderKeypad(document.querySelector("[data-keypad]"));
  wireInput();
  wireActions();
  renderRecents(document.querySelector("[data-recents]"));
  restoreLastNumber();

  calls.initTelephony().catch((error) => handleError(error, { silent: true }));

  on("call:changed", () => renderCall());
  on("call:tick", ({ duration }) => {
    if (timerEl) timerEl.textContent = formatDuration(duration);
  });
  on("calls:recorded", () => renderRecents(document.querySelector("[data-recents]")));
  subscribe((patch) => {
    if ("registrationStatus" in patch) renderRegistration(patch.registrationStatus);
  }, ["registrationStatus"]);

  renderRegistration(getState().registrationStatus);
  renderCall();
  handleCallLink();
}

/** Support deep links like /dialer.html?call=+2782...&name=Jane from Contacts. */
function handleCallLink() {
  const params = new URLSearchParams(window.location.search);
  const target = params.get("call");
  if (!target) return;
  numberBuffer = target;
  syncInput();
  if (matchEl && params.get("name")) matchEl.innerHTML = `<strong>${escapeHtml(params.get("name"))}</strong>`;
  window.history.replaceState({}, "", "/dialer.html");
  // Allow registration to settle before dialling.
  setTimeout(() => startCall(), 600);
}

function renderKeypad(container) {
  if (!container) return;
  clearChildren(container);
  for (const key of KEYPAD) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "keypad-key";
    btn.dataset.digit = key.digit;
    btn.setAttribute("aria-label", `${key.digit}${key.letters ? ` ${key.letters}` : ""}`);
    btn.innerHTML = `<span class="keypad-digit">${escapeHtml(key.digit)}</span><span class="keypad-letters">${escapeHtml(key.letters)}</span>`;
    btn.addEventListener("click", () => pressKey(key.digit));
    container.append(btn);
  }
}

function pressKey(digit) {
  if (callIsActive()) {
    calls.pressDtmf(digit);
    return;
  }
  numberBuffer = appendToBuffer(numberBuffer, digit);
  syncInput();
  calls.audio.playTone("dial");
  lookupMatch();
}

function appendToBuffer(buffer, digit) {
  const maxLength = 64;
  if (buffer.length >= maxLength) return buffer;
  // "0" long-press produces "+"; keep it simple and swap 0 -> + only via keypad "0" when empty.
  return buffer + digit;
}

function wireInput() {
  if (!inputEl) return;
  inputEl.addEventListener("input", () => {
    numberBuffer = inputEl.value;
    lookupMatch();
  });
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      startCall();
    }
  });
  const clearBtn = document.querySelector("[data-dial-clear]");
  clearBtn?.addEventListener("click", () => {
    numberBuffer = "";
    syncInput();
    if (matchEl) matchEl.textContent = "";
  });
  const backspace = document.querySelector("[data-dial-backspace]");
  backspace?.addEventListener("click", () => {
    numberBuffer = numberBuffer.slice(0, -1);
    syncInput();
    lookupMatch();
  });
}

function syncInput() {
  if (inputEl && inputEl.value !== numberBuffer) inputEl.value = numberBuffer;
}

const lookupMatch = debounce(async () => {
  if (!matchEl) return;
  const query = numberBuffer.trim();
  if (query.length < 3) {
    matchEl.innerHTML = "";
    return;
  }
  try {
    const result = await contactsApi.search({ q: query, limit: 1 });
    const contact = (result?.items || result || [])[0];
    if (contact) {
      matchEl.innerHTML = `<strong>${escapeHtml(contact.fullName || contact.displayName)}</strong>${contact.company ? ` · ${escapeHtml(contact.company)}` : ""}`;
    } else {
      matchEl.innerHTML = "";
    }
  } catch {
    matchEl.innerHTML = "";
  }
}, 300);

function wireActions() {
  document.querySelector("[data-dial-call]")?.addEventListener("click", startCall);
  document.querySelector("[data-dial-message]")?.addEventListener("click", () => {
    if (numberBuffer) notifyInfo("SMS is not part of CloudTel — use the dialer to place a call.");
  });
}

async function startCall() {
  const target = numberBuffer.trim();
  if (!target) return;
  saveJson(STORAGE_KEYS.LAST_NUMBER, target);
  const matchText = matchEl?.querySelector("strong")?.textContent || "";
  await calls.placeCall(target, { displayName: matchText });
}

function restoreLastNumber() {
  const last = loadJson(STORAGE_KEYS.LAST_NUMBER, "");
  if (last && inputEl) {
    numberBuffer = last;
    syncInput();
  }
}

function callIsActive() {
  const call = calls.getSnapshot().call;
  return Boolean(call && ![CALL_STATES.IDLE, CALL_STATES.ENDED, CALL_STATES.FAILED].includes(call.state));
}

/* ------------------------------------------------------------------ render */

function renderRegistration(status) {
  const banner = document.querySelector("[data-registration-banner]");
  if (!banner) return;
  const map = {
    registered: { cls: "is-connected", text: "Connected — ready to call" },
    registering: { cls: "is-registering", text: "Registering…" },
    connecting: { cls: "is-registering", text: "Connecting…" },
    registration_error: { cls: "is-error", text: "Registration failed" },
    unregistered: { cls: "is-unregistered", text: "Not registered" },
    retry_wait: { cls: "is-registering", text: "Reconnecting…" },
    reconnecting: { cls: "is-registering", text: "Reconnecting…" },
    disconnected: { cls: "is-error", text: "Disconnected" },
  };
  const info = map[status] || map.unregistered;
  banner.className = `registration-banner ${info.cls}`;
  banner.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(info.text)}</span>`;
}

function renderCall() {
  const { call } = calls.getSnapshot();
  const keypad = document.querySelector("[data-keypad-wrap]");
  const panel = document.querySelector("[data-active-call]");

  if (!call || [CALL_STATES.IDLE].includes(call.state)) {
    keypad?.classList.remove("hidden");
    panel?.classList.add("hidden");
    if (controlsEl) controlsEl.replaceChildren();
    return;
  }

  keypad?.classList.add("hidden");
  panel?.classList.remove("hidden");
  renderCallPanel(call);
}

function renderCallPanel(call) {
  const panel = document.querySelector("[data-active-call]");
  if (!panel) return;
  const ended = [CALL_STATES.ENDED, CALL_STATES.FAILED].includes(call.state);

  const labels = {
    [CALL_STATES.INCOMING]: "Incoming call",
    [CALL_STATES.INITIATING]: "Calling…",
    [CALL_STATES.RINGING]: "Ringing…",
    [CALL_STATES.CONNECTING]: "Connecting…",
    [CALL_STATES.ACTIVE]: "In call",
    [CALL_STATES.HELD]: "On hold",
    [CALL_STATES.ENDED]: "Call ended",
    [CALL_STATES.FAILED]: "Call failed",
  };

  panel.innerHTML = `
    <div class="call-panel">
      <span class="call-panel-status ${call.state === CALL_STATES.ACTIVE ? "is-active" : call.state === CALL_STATES.RINGING || call.state === CALL_STATES.INCOMING ? "is-ringing" : ""}">
        ${escapeHtml(labels[call.state] || call.state)}
      </span>
      <div class="call-panel-peer">${escapeHtml(call.displayName || formatPhone(call.remoteNumber))}</div>
      <div class="call-panel-number">${escapeHtml(formatPhone(call.remoteNumber))}</div>
      <div class="call-panel-timer">${escapeHtml(formatDuration(calls.callState.callDurationSeconds()))}</div>
      <div data-active-controls class="call-controls"></div>
    </div>`;

  const controls = panel.querySelector("[data-active-controls]");
  renderCallControls(controls, call, ended);
}

function renderCallControls(container, call, ended) {
  clearChildren(container);
  if (ended) {
    container.append(makeControl("Close", "x", () => calls.callState.clearCall(), "hangup"));
    return;
  }

  if (call.state === CALL_STATES.INCOMING) {
    container.append(makeControl("Decline", "phoneOff", () => calls.declineCall(), "hangup"));
    container.append(makeControl("Answer", "phoneCall", () => calls.answerCall(), "answer"));
    return;
  }

  container.append(makeControl(call.muted ? "Unmute" : "Mute", call.muted ? "micOff" : "mic", () => calls.setMuted(!call.muted), "mute", call.muted));
  container.append(makeControl(call.held ? "Resume" : "Hold", call.held ? "play" : "pause", () => calls.setHold(!call.held), "hold", call.held));
  container.append(makeControl("Keypad", "grid3x3", () => toggleDtmfPad(container)));
  container.append(makeControl("Transfer", "phoneForwarded", () => promptTransfer()));
  container.append(makeControl("Hang up", "phoneOff", () => calls.hangupCall(), "hangup"));
}

function makeControl(label, iconName, onClick, variant = "", pressed = false) {
  const wrap = document.createElement("div");
  wrap.className = "call-control";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `call-control-btn${variant ? ` call-control-${variant}` : ""}`;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", pressed ? "true" : "false");
  btn.append(icon(iconName, { size: 22 }));
  btn.addEventListener("click", onClick);
  const caption = document.createElement("span");
  caption.className = "call-control-label";
  caption.textContent = label;
  wrap.append(btn, caption);
  return wrap;
}

function toggleDtmfPad(container) {
  const existing = container.parentElement.querySelector(".dtmf-pad");
  if (existing) {
    existing.remove();
    return;
  }
  const pad = document.createElement("div");
  pad.className = "dtmf-pad";
  for (const key of KEYPAD) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = key.digit;
    btn.addEventListener("click", () => calls.pressDtmf(key.digit));
    pad.append(btn);
  }
  container.parentElement.append(pad);
}

async function promptTransfer() {
  const target = window.prompt("Transfer to (extension or number):");
  if (target) await calls.transferCall(target.trim(), { attended: false });
}

/* ---------------------------------------------------------------- recents */

async function renderRecents(container) {
  if (!container) return;
  clearChildren(container);
  try {
    const result = await callsApi.list({ pageSize: 8 });
    const items = result?.items || result || [];
    if (!items.length) {
      container.append(emptyState({ icon: "clock", title: "No recent calls", message: "Your call history will appear here." }));
      return;
    }
    const list = document.createElement("div");
    list.className = "recent-list";
    for (const call of items) {
      list.append(recentRow(call));
    }
    container.append(list);
  } catch (error) {
    container.append(emptyState({ icon: "alertCircle", title: "Could not load recents", message: error?.message || "" }));
  }
}

function recentRow(call) {
  const row = document.createElement("div");
  row.className = "recent-item";
  const dirIcon = call.direction === "incoming" ? "phoneIncoming" : "phoneOutgoing";
  const dirWrap = document.createElement("span");
  dirWrap.className = `history-direction is-${call.direction === "incoming" ? "incoming" : "outgoing"}`;
  dirWrap.append(icon(dirIcon, { size: 16 }));

  const meta = document.createElement("div");
  meta.className = "recent-item-meta";
  meta.innerHTML = `
    <div class="recent-item-name">${escapeHtml(call.displayName || call.callerName || formatPhone(call.remoteNumber || call.calleeNumber || call.callerNumber))}</div>
    <div class="recent-item-number">${escapeHtml(formatPhone(call.remoteNumber || call.callerNumber || call.calleeNumber || ""))}</div>`;

  const callBtn = document.createElement("button");
  callBtn.type = "button";
  callBtn.className = "btn btn--ghost btn--icon btn--sm";
  callBtn.setAttribute("aria-label", "Call back");
  callBtn.append(icon("phoneCall", { size: 16 }));
  callBtn.addEventListener("click", () => {
    const target = call.remoteNumber || call.callerNumber || call.calleeNumber;
    numberBuffer = target || "";
    syncInput();
    startCall();
  });

  row.append(dirWrap, meta, callBtn);
  return row;
}

export { startCall, renderRecents };
