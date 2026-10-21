/**
 * Server-side request validation helpers.
 * Field rules come from @cloudtel/shared so client and server always agree.
 */
import { ApiError } from "./response.js";

export function assertValid(result, message = "The request contains invalid fields.") {
  if (!result.valid) {
    throw new ApiError(422, "VALIDATION_ERROR", message, result.errors);
  }
  return result.value ?? true;
}

export function requireString(body, field, { max = 500, min = 1 } = {}) {
  const value = body?.[field];
  if (typeof value !== "string" || value.trim().length < min) {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      [field]: `${field} is required.`,
    });
  }
  if (value.length > max) {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      [field]: `${field} must be ${max} characters or fewer.`,
    });
  }
  return value.trim();
}

export function optionalString(body, field, { max = 500, allowEmpty = true } = {}) {
  const value = body?.[field];
  if (value === undefined || value === null) return allowEmpty ? "" : undefined;
  if (typeof value !== "string") {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      [field]: `${field} must be text.`,
    });
  }
  if (value.length > max) {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      [field]: `${field} must be ${max} characters or fewer.`,
    });
  }
  return value.trim();
}

export function optionalBoolean(body, field, fallback = undefined) {
  const value = body?.[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      [field]: `${field} must be true or false.`,
    });
  }
  return value;
}

export function optionalEnum(body, field, allowed, fallback = undefined) {
  const value = body?.[field];
  if (value === undefined || value === null || value === "") return fallback;
  if (!allowed.includes(value)) {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      [field]: `${field} must be one of: ${allowed.join(", ")}.`,
    });
  }
  return value;
}

export function optionalInteger(body, field, { min = 0, max = 1000000, fallback = undefined } = {}) {
  const value = body?.[field];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      [field]: `${field} must be an integer between ${min} and ${max}.`,
    });
  }
  return parsed;
}

export function requireId(value, _field = "id") {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }
  return value;
}
