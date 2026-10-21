/**
 * Audit logging for sensitive and administrative operations.
 * Writes are best-effort: an audit failure must not roll back the operation
 * itself, but it is logged loudly.
 */
import { query } from "./database.js";

/**
 * @param {object} entry
 * @param {string|null} [entry.organisationId]
 * @param {string|null} [entry.userId]
 * @param {string} entry.action - dotted action name, e.g. "user.suspend"
 * @param {string} [entry.resourceType]
 * @param {string} [entry.resourceId]
 * @param {object} [entry.metadata]
 * @param {string} [entry.ip]
 * @param {string} [entry.requestId]
 */
export async function audit(entry) {
  try {
    await query(
      `INSERT INTO audit_logs (organisation_id, user_id, action, resource_type, resource_id, metadata, ip, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.organisationId || null,
        entry.userId || null,
        entry.action,
        entry.resourceType || "",
        entry.resourceId || "",
        JSON.stringify(entry.metadata || {}),
        entry.ip || "",
        entry.requestId || "",
      ]
    );
  } catch (err) {
    console.error("audit:write-failed", { action: entry.action, message: err?.message });
  }
}
