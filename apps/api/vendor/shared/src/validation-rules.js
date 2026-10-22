/**
 * CloudTel validation rules and phone-number normalisation.
 * Enforced identically on the client (dialer, forms) and the server (API).
 * South African numbering is the reference implementation (spec 4.3).
 */
import { LIMITS, PAGINATION } from "./constants.js";

const SA_COUNTRY_CODE = "27";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Characters that users routinely type around telephone numbers. */
const NOISE = /[\s()\-.]/g;

export function cleanNumberInput(input) {
  return String(input ?? "").replace(NOISE, "");
}

/** Reject strings containing ASCII control characters or DEL. */
export function hasControlCharacters(value) {
  const s = String(value ?? "");
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * Normalise a dialed or stored telephone number.
 * @returns {{
 *   raw: string,
 *   digits: string,
 *   e164: string|null,
 *   isExtension: boolean,
 *   valid: boolean,
 *   country: "ZA"|"intl"|"extension"|"unknown"
 * }}
 */
export function normalisePhoneNumber(input) {
  const raw = String(input ?? "").trim();
  let value = cleanNumberInput(raw);

  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  }

  if (value.startsWith("+")) {
    const digits = value.slice(1);
    if (!/^\d+$/.test(digits) || digits.length < 8 || digits.length > 15) {
      return { raw, digits, e164: null, isExtension: false, valid: false, country: "unknown" };
    }
    return {
      raw,
      digits,
      e164: `+${digits}`,
      isExtension: false,
      valid: true,
      country: digits.startsWith(SA_COUNTRY_CODE) ? "ZA" : "intl",
    };
  }

  if (!/^\d+$/.test(value)) {
    return { raw, digits: value, e164: null, isExtension: false, valid: false, country: "unknown" };
  }

  // Short digit strings are internal extensions.
  if (value.length >= LIMITS.EXTENSION_NUMBER_MIN && value.length <= 6) {
    return { raw, digits: value, e164: null, isExtension: true, valid: true, country: "extension" };
  }

  // South African geographic/mobile: 0XXXXXXXXX (10 digits).
  if (value.length === 10 && value.startsWith("0")) {
    const rest = value.slice(1);
    return {
      raw,
      digits: value,
      e164: `+${SA_COUNTRY_CODE}${rest}`,
      isExtension: false,
      valid: true,
      country: "ZA",
    };
  }

  // South African national significant number: 9 digits starting 1-9.
  if (value.length === 9 && /^[1-9]/.test(value)) {
    return {
      raw,
      digits: value,
      e164: `+${SA_COUNTRY_CODE}${value}`,
      isExtension: false,
      valid: true,
      country: "ZA",
    };
  }

  // Other international numbers typed without a plus prefix.
  if (value.length >= 8 && value.length <= 15) {
    return { raw, digits: value, e164: null, isExtension: false, valid: true, country: "intl" };
  }

  return { raw, digits: value, e164: null, isExtension: false, valid: false, country: "unknown" };
}

/** True when the number can be confidently stored/compared as E.164. */
export function isValidPhoneNumber(input) {
  return normalisePhoneNumber(input).valid;
}

/** The string the dialer should hand to SIP (keeps user intent when not E.164). */
export function dialableTarget(input) {
  const n = normalisePhoneNumber(input);
  if (!n.valid) return null;
  return n.e164 || n.digits;
}

/** Format a stored number for display. */
export function formatPhoneNumber(input, format = "international") {
  const n = normalisePhoneNumber(input);
  if (!n.valid) return String(input ?? "").trim();
  const e164 = n.e164 || `+${n.digits}`;

  if (format === "local" && e164.startsWith(`+${SA_COUNTRY_CODE}`)) {
    const rest = e164.slice(1 + SA_COUNTRY_CODE.length);
    if (rest.length === 9) return `0${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
    return `0${rest}`;
  }
  if (n.isExtension) return n.digits;
  return e164;
}

export function validateEmail(input) {
  const value = String(input ?? "").trim();
  if (!value) return { valid: false, message: "Email address is required." };
  if (value.length > LIMITS.EMAIL_MAX) return { valid: false, message: "Email address is too long." };
  if (!EMAIL_RE.test(value)) return { valid: false, message: "Enter a valid email address." };
  return { valid: true, value };
}

export function validatePassword(input, { requireStrength = true } = {}) {
  const value = String(input ?? "");
  if (!value) return { valid: false, message: "Password is required." };
  if (value.length < LIMITS.PASSWORD_MIN) {
    return { valid: false, message: `Use at least ${LIMITS.PASSWORD_MIN} characters.` };
  }
  if (value.length > LIMITS.PASSWORD_MAX) {
    return { valid: false, message: "Password is too long." };
  }
  if (requireStrength) {
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
    if (classes < 2) {
      return { valid: false, message: "Mix letters with numbers or symbols." };
    }
  }
  return { valid: true, value };
}

export function validateName(input, { field = "Name", required = true, max = LIMITS.NAME_MAX } = {}) {
  const value = String(input ?? "").trim();
  if (!value) return { valid: !required, message: required ? `${field} is required.` : undefined };
  if (value.length > max) {
    return { valid: false, message: `${field} must be ${max} characters or fewer.` };
  }
  if (hasControlCharacters(value)) {
    return { valid: false, message: `${field} contains invalid characters.` };
  }
  return { valid: true, value };
}

export function validateDisplayName(input) {
  return validateName(input, { field: "Display name", max: LIMITS.DISPLAY_NAME_MAX });
}

export function validateExtensionNumber(input) {
  const value = String(input ?? "").trim();
  const min = LIMITS.EXTENSION_NUMBER_MIN;
  const max = LIMITS.EXTENSION_NUMBER_MAX;
  if (!value) return { valid: false, message: "Extension number is required." };
  if (!/^\d+$/.test(value)) return { valid: false, message: "Extension numbers use digits only." };
  if (value.length < min || value.length > max) {
    return { valid: false, message: `Extension must be ${min}-${max} digits.` };
  }
  return { valid: true, value };
}

export function validateNotes(input) {
  const value = String(input ?? "");
  if (value.length > LIMITS.NOTES_MAX) {
    return { valid: false, message: `Notes must be ${LIMITS.NOTES_MAX} characters or fewer.` };
  }
  return { valid: true, value };
}

export function validateContact(input = {}, { requirePhone = true } = {}) {
  const errors = {};
  const name = validateName(input.fullName, { field: "Full name" });
  if (!name.valid) errors.fullName = name.message;

  const phone = String(input.phone ?? "").trim();
  const phone2 = String(input.phone2 ?? "").trim();
  if (requirePhone && !phone && !phone2) {
    errors.phone = "At least one telephone number is required.";
  } else {
    if (phone && !isValidPhoneNumber(phone)) errors.phone = "Enter a valid telephone number.";
    if (phone2 && !isValidPhoneNumber(phone2)) errors.phone2 = "Enter a valid telephone number.";
  }
  if (input.email) {
    const email = validateEmail(input.email);
    if (!email.valid) errors.email = email.message;
  }
  const notes = validateNotes(input.notes);
  if (!notes.valid) errors.notes = notes.message;

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateUserInput(input = {}) {
  const errors = {};
  const name = validateName(input.name, { field: "Name" });
  if (!name.valid) errors.name = name.message;
  const email = validateEmail(input.email);
  if (!email.valid) errors.email = email.message;
  if (input.password !== undefined) {
    const password = validatePassword(input.password);
    if (!password.valid) errors.password = password.message;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Parse and clamp pagination query parameters.
 * @returns {{page:number, pageSize:number, offset:number, limit:number}}
 */
export function parsePagination(query = {}, defaults = {}) {
  const DEFAULT_SIZE = defaults.pageSize || PAGINATION.DEFAULT_PAGE_SIZE;
  const MAX_SIZE = PAGINATION.MAX_PAGE_SIZE;
  let page = Number.parseInt(query.page, 10);
  let pageSize = Number.parseInt(query.pageSize ?? query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_SIZE;
  pageSize = Math.min(pageSize, MAX_SIZE);
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

/** Validate an id path parameter (UUID shape used by the schema). */
export function isValidId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
