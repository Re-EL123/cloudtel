/**
 * Voicemail: message list, playback and management.
 * Transcription is displayed when the telephony provider supplies it.
 */
import { callsApi } from "../core/endpoints.js";
import { api } from "../core/api-client.js";
import { handleError } from "../core/error-handler.js";
import { setPageTitle } from "../core/app-shell.js";
import { getState, setState } from "../core/state.js";
import { escapeHtml, formatDuration, formatDateTime, clearChildren } from "../core/utils.js";
import { icon } from "../components/icons.js";
import { avatar, emptyState, loadingRows } from "../components/common.js";
import { confirmDialog } from "../ui/dialogs.js";
import { notifySuccess } from "../ui/notifications.js";

let messages = [];
let selectedId = null;

export async function initVoicemail() {
  setPageTitle("Voicemail");
  renderLayout();
  await loadMessages();
}

function renderLayout() {
  const root = document.querySelector("[data-voicemail-root]");
  if (!root) return;
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Voicemail</h1>
        <p class="page-subtitle">Messages left for your extension.</p>
      </div>
      <button type="button" class="btn btn--secondary" data-voicemail-refresh>
        ${icon("refresh", { size: 18 }).outerHTML}<span>Refresh</span>
      </button>
    </div>
    <div class="page-scroll">
      <div class="voicemail-layout">
        <div data-voicemail-list></div>
        <div data-voicemail-player></div>
      </div>
    </div>`;
  document.querySelector("[data-voicemail-refresh]")?.addEventListener("click", loadMessages);
}

async function loadMessages() {
  const list = document.querySelector("[data-voicemail-list]");
  if (!list) return;
  clearChildren(list);
  list.append(loadingRows(5));
  try {
    const result = await api.get("/calls", { pageSize: 50, disposition: "voicemail" });
    messages = (result?.items || result || []).map((call) => ({
      id: call.id,
      from: call.callerName || call.callerNumber || "Unknown",
      number: call.callerNumber || call.remoteNumber || "",
      at: call.endedAt || call.startedAt,
      duration: call.durationSeconds || 0,
      unread: !call.voicemailHeard,
      transcript: call.transcript || "",
      audioUrl: call.recordingUrl || null,
    }));
    setState({ voicemailUnread: messages.filter((m) => m.unread).length });
    renderList();
  } catch (error) {
    list.replaceChildren(emptyState({ icon: "alertCircle", title: "Could not load voicemail", message: error?.message || "" }));
  }
}

function renderList() {
  const list = document.querySelector("[data-voicemail-list]");
  if (!list) return;
  clearChildren(list);

  if (!messages.length) {
    list.append(emptyState({ icon: "voicemail", title: "No voicemail", message: "Messages will appear here when callers leave one." }));
    renderPlayer(null);
    return;
  }

  const container = document.createElement("div");
  container.className = "voicemail-list";
  for (const message of messages) {
    container.append(messageRow(message));
  }
  list.append(container);
  renderPlayer(messages.find((m) => m.id === selectedId) || messages[0]);
  if (!selectedId) selectedId = messages[0].id;
}

function messageRow(message) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `voicemail-item${message.id === selectedId ? " is-selected" : ""}`;
  row.dataset.voicemailId = message.id;
  row.innerHTML = `
    <div class="voicemail-item-top">
      <span class="voicemail-item-name">${escapeHtml(message.from)}${message.unread ? ' <span class="visually-hidden">(unread)</span>' : ""}</span>
      <span class="voicemail-item-time">${escapeHtml(formatDateTime(message.at, getState().timezone))}</span>
      ${message.unread ? '<span class="voicemail-unread-dot" aria-hidden="true"></span>' : ""}
    </div>
    <div class="voicemail-item-preview">${escapeHtml(message.transcript || `${formatDuration(message.duration)} message`)}</div>`;
  row.addEventListener("click", () => {
    selectedId = message.id;
    markRead(message);
    document.querySelectorAll(".voicemail-item").forEach((r) => r.classList.toggle("is-selected", r.dataset.voicemailId === message.id));
    renderPlayer(message);
  });
  return row;
}

function renderPlayer(message) {
  const player = document.querySelector("[data-voicemail-player]");
  if (!player) return;
  clearChildren(player);
  if (!message) {
    player.append(emptyState({ icon: "headphones", title: "Nothing selected", message: "Pick a message to play it." }));
    return;
  }

  const card = document.createElement("div");
  card.className = "card voicemail-player";

  const header = document.createElement("div");
  header.className = "voicemail-player-header";
  header.append(avatar({ name: message.from, size: "lg" }));
  const info = document.createElement("div");
  info.className = "grow";
  info.innerHTML = `
    <div class="contact-detail-name">${escapeHtml(message.from)}</div>
    <div class="text-sm text-muted">${escapeHtml(message.number)} · ${escapeHtml(formatDateTime(message.at, getState().timezone))}</div>`;
  header.append(info);
  card.append(header);

  if (message.audioUrl) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = message.audioUrl;
    audio.preload = "none";
    card.append(audio);
  } else {
    const placeholder = document.createElement("p");
    placeholder.className = "text-muted text-sm";
    placeholder.textContent = "The audio recording is not available for this message.";
    card.append(placeholder);
  }

  const actions = document.createElement("div");
  actions.className = "row";
  actions.append(actionBtn("Call back", "phoneCall", "primary", () => startCallWith(message.number, message.from)));
  actions.append(actionBtn("Delete", "trash", "danger-outline", () => deleteMessage(message)));
  card.append(actions);

  if (message.transcript) {
    const transcript = document.createElement("div");
    transcript.className = "voicemail-transcript";
    transcript.textContent = message.transcript;
    card.append(transcript);
  }

  player.append(card);
}

function actionBtn(label, iconName, variant, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `btn btn--${variant} btn--sm`;
  btn.append(icon(iconName, { size: 16 }));
  const span = document.createElement("span");
  span.textContent = label;
  btn.append(span);
  btn.addEventListener("click", onClick);
  return btn;
}

async function markRead(message) {
  if (!message.unread) return;
  message.unread = false;
  setState({ voicemailUnread: Math.max(0, (getState().voicemailUnread || 1) - 1) });
  try {
    await api.patch(`/calls/${message.id}`, { voicemailHeard: true });
  } catch {
    /* non-critical */
  }
}

async function deleteMessage(message) {
  const ok = await confirmDialog({ title: "Delete message", message: "Delete this voicemail message?", confirmLabel: "Delete" });
  if (!ok) return;
  try {
    await api.delete(`/calls/${message.id}`);
    selectedId = null;
    notifySuccess("Message deleted.");
    await loadMessages();
  } catch (error) {
    handleError(error);
  }
}

function startCallWith(target, name) {
  window.location.href = `/dialer.html?call=${encodeURIComponent(target || "")}&name=${encodeURIComponent(name || "")}`;
}
