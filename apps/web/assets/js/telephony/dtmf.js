/**
 * DTMF handling: in-band tone feedback, RFC 4733 signalling through SIP INFO,
 * and normalisation of user input into a dialable target.
 */
import { normalisePhoneNumber, dialableTarget, cleanNumberInput } from "../shared/validation-rules.js";
import { LIMITS } from "../shared/constants.js";
import { playTone } from "./audio.js";

const DTMF_KEYS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"]);

export function isDtmfKey(value) {
  return DTMF_KEYS.has(value);
}

/** Append a key to a number buffer, respecting length limits. */
export function appendDigit(buffer, digit) {
  if (!isDtmfKey(digit)) return buffer;
  if (buffer.length >= LIMITS.NUMBER_INPUT_MAX) return buffer;
  return buffer + digit;
}

export function appendDigits(buffer, digits) {
  let next = buffer;
  for (const digit of String(digits)) next = appendDigit(next, digit);
  return next;
}

/**
 * Send DTMF to the far end via SIP INFO (RFC 2976 / RFC 4733) and play a
 * local confirmation tone. UI presses go through here so the phone keypad and
 * the in-call keypad behave identically.
 * @param {object} session - SIP.Session
 * @param {string} digit
 * @param {{tone?:boolean}} [options]
 */
export async function sendDtmf(session, digit, options = {}) {
  const { tone = true } = options;
  if (!isDtmfKey(digit)) throw new Error(`Not a DTMF key: ${digit}`);
  if (tone) playTone("dial");

  if (!session) return false;
  try {
    // SIP.js exposes session.info() on Inviter/Invitation sessions.
    if (typeof session.info === "function") {
      await session.info({
        requestOptions: { body: { contentDisposition: "render", contentType: "application/dtmf-relay" } },
      });
    } else if (typeof session.sessionDescriptionHandler?.sendDtmf === "function") {
      session.sessionDescriptionHandler.sendDtmf(digit);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Turn dialled input into a SIP dial target: extension numbers stay bare,
 * external numbers are normalised to E.164 for the outbound trunk.
 */
export function resolveDialTarget(input, { extensionNumbers = [] } = {}) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  if (raw.startsWith("sip:") || raw.startsWith("sips:")) return raw;

  // Internal extension: short numeric and matches a known extension.
  if (/^\d{2,6}$/.test(raw) && extensionNumbers.includes(raw)) return raw;

  if (raw.startsWith("*") || raw.startsWith("#")) return raw;

  const normalised = normalisePhoneNumber(raw);
  if (normalised.isExtension) return normalised.digits;
  return dialableTarget(raw) || raw;
}

export function formatTargetForDisplay(target) {
  const value = String(target || "");
  if (value.startsWith("sip:")) return value.replace(/^sip:/, "").split("@")[0];
  return value;
}

export { cleanNumberInput };
