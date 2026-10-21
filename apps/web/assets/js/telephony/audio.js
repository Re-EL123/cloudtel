/**
 * WebRTC audio device management: enumeration, selection and applying the
 * user's microphone/speaker choices to an active media session.
 * UI never touches getUserMedia directly (AGENTS.md §3).
 */
import { STORAGE_KEYS } from "../core/config.js";
import { loadJson, saveJson } from "../core/utils.js";

let inputDeviceId = null;
let outputDeviceId = null;
let permissionGranted = false;
let devices = { inputs: [], outputs: [] };
let onDeviceChange = null;

/** Ask for microphone permission once, then remember the grant. */
export async function ensureMicrophoneAccess() {
  if (permissionGranted) return true;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    permissionGranted = true;
    return true;
  } catch {
    permissionGranted = false;
    return false;
  }
}

export function hasMicrophoneAccess() {
  return permissionGranted;
}

/** Enumerate available audio input and output devices. */
export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    devices = { inputs: [], outputs: [] };
    return devices;
  }
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = {
      inputs: all.filter((d) => d.kind === "audioinput"),
      outputs: all.filter((d) => d.kind === "audiooutput"),
    };
    if (!inputDeviceId && devices.inputs[0]) inputDeviceId = devices.inputs[0].deviceId;
    if (!outputDeviceId && devices.outputs[0]) outputDeviceId = devices.outputs[0].deviceId;
    return devices;
  } catch {
    devices = { inputs: [], outputs: [] };
    return devices;
  }
}

export function getDevices() {
  return devices;
}

/** Watch for device plug/unplug and notify the shell for the status bar. */
export function watchDevices(handler) {
  onDeviceChange = handler;
  navigator.mediaDevices?.addEventListener?.("devicechange", async () => {
    await listDevices();
    onDeviceChange?.(devices);
  });
}

export function getSelectedInput() {
  return inputDeviceId || loadJson(STORAGE_KEYS.DEVICE_IN, null);
}

export function getSelectedOutput() {
  return outputDeviceId || loadJson(STORAGE_KEYS.DEVICE_OUT, null);
}

export function setSelectedInput(deviceId) {
  inputDeviceId = deviceId;
  saveJson(STORAGE_KEYS.DEVICE_IN, deviceId);
}

export function setSelectedOutput(deviceId) {
  outputDeviceId = deviceId;
  saveJson(STORAGE_KEYS.DEVICE_OUT, deviceId);
}

export function describeDevice(deviceId, kind) {
  const list = kind === "output" ? devices.outputs : devices.inputs;
  const found = list.find((d) => d.deviceId === deviceId);
  const fallback = kind === "output" ? "Speaker" : "Microphone";
  return found?.label || `${fallback} (${deviceId ? "selected" : "default"})`;
}

/**
 * Apply the selected devices to a live media session.
 * Output selection uses setSinkId when the browser supports it.
 */
export async function applyToSession({ localStream, remoteAudioElements = [] } = {}) {
  if (localStream) {
    const track = localStream.getAudioTracks()[0];
    const wanted = getSelectedInput();
    if (track && wanted) {
      try {
        const constraints = { deviceId: { exact: wanted } };
        // Prefer applyConstraints; fall back silently when unsupported.
        await track.applyConstraints(constraints);
      } catch {
        /* keep the current track */
      }
    }
  }

  const outputId = getSelectedOutput();
  if (outputId) {
    for (const el of remoteAudioElements) {
      if (el && typeof el.setSinkId === "function") {
        try {
          await el.setSinkId(outputId);
        } catch {
          /* sink selection unsupported */
        }
      }
    }
  }
}

/**
 * A short tone player for the dial pad and ringback (not for call audio).
 * Kinds: "dial", "ringback", "ring", "busy", "ended".
 */
export function playTone(kind, { volume = 0.15 } = {}) {
  const prefs = { enabled: loadJson(STORAGE_KEYS.DIALPAD_TONES, true) };
  if (kind === "dial" && !prefs.enabled) return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(ctx.destination);

  const tone = (frequency, start, duration) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(gain);
    osc.start(now + start);
    osc.stop(now + start + duration);
  };

  if (kind === "dial") {
    tone(941, 0, 0.08);
    tone(1477, 0, 0.08);
    setTimeout(() => ctx.close().catch(() => {}), 200);
    return;
  }
  if (kind === "busy") {
    tone(480, 0, 0.5);
    setTimeout(() => ctx.close().catch(() => {}), 700);
    return;
  }
  if (kind === "ringback") {
    // UK-style double ring, looped by the caller re-invoking this helper.
    tone(440, 0, 0.4);
    tone(480, 0, 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 600);
    return;
  }
  if (kind === "ended") {
    tone(440, 0, 0.12);
    tone(330, 0.14, 0.2);
    setTimeout(() => ctx.close().catch(() => {}), 500);
    return;
  }
  ctx.close().catch(() => {});
}

export function resetAudioDevices() {
  inputDeviceId = null;
  outputDeviceId = null;
}
