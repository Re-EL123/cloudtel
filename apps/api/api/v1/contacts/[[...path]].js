/**
 * Serverless function 5: Contacts
 * GET    /api/v1/contacts
 * GET    /api/v1/contacts/search
 * GET    /api/v1/contacts/favourites
 * GET    /api/v1/contacts/:id
 * POST   /api/v1/contacts
 * PATCH  /api/v1/contacts/:id
 * POST   /api/v1/contacts/:id/favourite
 * DELETE /api/v1/contacts/:id/favourite
 * DELETE /api/v1/contacts/:id
 *
 * Contacts are organisation-scoped. Personal contacts carry owner_user_id and
 * are visible only to their owner; organisation contacts are visible to every
 * member (spec §4.6).
 */
import { CONTACT_SCOPES, isValidId, validateContact, normalisePhoneNumber, parsePagination } from "@cloudtel/shared";
import { success, created, noContent, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import {
  PERMISSIONS,
  canDeleteContact,
  canModifyContact,
  contextCan,
  requireOrganisation,
} from "../../../lib/authorisation.js";
import { audit } from "../../../lib/audit.js";
import { optionalString } from "../../../lib/validation.js";

function publicContact(row) {
  return {
    id: row.id,
    scope: row.scope,
    ownerUserId: row.owner_user_id,
    fullName: row.full_name,
    displayName: row.display_name,
    company: row.company,
    department: row.department,
    phone: row.phone,
    phone2: row.phone2,
    email: row.email,
    notes: row.notes,
    isFavourite: Boolean(row.is_favourite),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `SELECT * FROM contacts WHERE organisation_id = $1`;

/**
 * Build the visibility conditions for a contact query (org scope plus personal
 * / organisation contact rules) and return the SQL fragment and its params.
 */
function visibilityConditions(ctx, organisationId, { organisationWide = false } = {}) {
  const conditions = ["organisation_id = $1"];
  const params = [organisationId];
  if (!organisationWide && !contextCan(ctx, PERMISSIONS.CONTACTS_READ)) {
    params.push(ctx.user.id);
    conditions.push(`owner_user_id = $${params.length}`);
  } else if (!organisationWide) {
    // Members with contacts:read still only see organisation contacts or their own.
    params.push(ctx.user.id);
    const idx = params.length;
    conditions.push(`(scope = 'organisation' AND owner_user_id IS NULL OR owner_user_id = $${idx})`);
  }
  return { conditions, params };
}

async function loadContact(organisationId, id) {
  if (!isValidId(id)) throw new ApiError(404, "NOT_FOUND", "Contact not found.");
  const { rows } = await query(`${SELECT} AND id = $2`, [organisationId, id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Contact not found.");
  return rows[0];
}

function normalisedPhone(phone, phone2) {
  const primary = normalisePhoneNumber(phone);
  const secondary = normalisePhoneNumber(phone2);
  if (primary.valid && primary.e164) return primary.e164;
  if (secondary.valid && secondary.e164) return secondary.e164;
  return primary.valid ? primary.digits : secondary.valid ? secondary.digits : "";
}

const routes = [
  {
    method: "GET",
    path: "/contacts",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { page, pageSize, offset, limit } = parsePagination(ctx.query);
      const search = (ctx.query.search || "").trim().slice(0, 80);
      const scope = ctx.query.scope;
      const ownerOnly = ctx.query.mine === "true" || !contextCan(ctx, PERMISSIONS.CONTACTS_READ);

      const conditions = ["organisation_id = $1"];
      const params = [organisationId];
      if (ownerOnly) {
        params.push(ctx.user.id);
        conditions.push(`owner_user_id = $${params.length}`);
      }
      if (scope === CONTACT_SCOPES.PERSONAL || scope === CONTACT_SCOPES.ORGANISATION) {
        params.push(scope);
        conditions.push(`scope = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        conditions.push(
          `(full_name ILIKE $${idx} OR display_name ILIKE $${idx} OR company ILIKE $${idx} OR phone_normalized ILIKE $${idx} OR phone ILIKE $${idx} OR phone2 ILIKE $${idx})`
        );
      }

      const where = conditions.join(" AND ");
      params.push(ctx.user.id);
      const favIdx = params.length;
      params.push(limit, offset);
      const { rows } = await query(
        `SELECT c.*, (f.user_id IS NOT NULL) AS is_favourite
           FROM contacts c
           LEFT JOIN contact_favourites f ON f.contact_id = c.id AND f.user_id = $${favIdx}
          WHERE ${conditions.map((c) => c.replace(/\b(organisation_id|owner_user_id|scope|full_name|display_name|company|phone_normalized|phone|phone2)\b/g, "c.$1")).join(" AND ")}
          ORDER BY lower(c.full_name) LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const countParams = params.slice(0, favIdx - 1);
      const countResult = await query(`SELECT count(*)::int AS total FROM contacts WHERE ${where}`, countParams);

      success(ctx.res, rows.map(publicContact), {
        meta: { page, pageSize, total: countResult.rows[0].total },
        requestId: ctx.requestId,
      });
    },
  },

  {
    method: "GET",
    path: "/contacts/search",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const term = (ctx.query.q || ctx.query.search || "").trim().slice(0, 80);
      const limit = Math.min(Math.max(Number.parseInt(ctx.query.limit, 10) || 20, 1), 50);
      const { conditions, params } = visibilityConditions(ctx, organisationId);
      const scoped = conditions.map((c) => c.replace(/\b(organisation_id|owner_user_id|scope)\b/g, "c.$1"));
      params.push(ctx.user.id);
      const favIdx = params.length;
      if (term) {
        params.push(`%${term}%`);
        const idx = params.length;
        scoped.push(
          `(c.full_name ILIKE $${idx} OR c.display_name ILIKE $${idx} OR c.company ILIKE $${idx} OR c.phone_normalized ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.phone2 ILIKE $${idx} OR c.email ILIKE $${idx})`
        );
      }
      params.push(limit);
      const { rows } = await query(
        `SELECT c.*, (f.user_id IS NOT NULL) AS is_favourite
           FROM contacts c
           LEFT JOIN contact_favourites f ON f.contact_id = c.id AND f.user_id = $${favIdx}
          WHERE ${scoped.join(" AND ")}
          ORDER BY lower(c.full_name) LIMIT $${params.length}`,
        params
      );
      success(ctx.res, rows.map(publicContact), { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/contacts/favourites",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const { rows } = await query(
        `SELECT c.*, true AS is_favourite
           FROM contact_favourites f
           JOIN contacts c ON c.id = f.contact_id
          WHERE f.user_id = $1 AND f.organisation_id = $2
          ORDER BY lower(c.full_name)`,
        [ctx.user.id, organisationId]
      );
      success(ctx.res, rows.map(publicContact), { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/contacts/:id",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const contact = await loadContact(organisationId, ctx.params.id);
      const isOwner = contact.owner_user_id === ctx.user.id;
      const orgWide = contact.scope === CONTACT_SCOPES.ORGANISATION && !contact.owner_user_id;
      if (!orgWide && !isOwner && !contextCan(ctx, PERMISSIONS.CONTACTS_READ)) {
        throw new ApiError(404, "NOT_FOUND", "Contact not found.");
      }
      success(ctx.res, publicContact(contact), { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/contacts",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const body = ctx.body || {};
      let scope = body.scope === CONTACT_SCOPES.PERSONAL ? CONTACT_SCOPES.PERSONAL : CONTACT_SCOPES.ORGANISATION;

      if (scope === CONTACT_SCOPES.ORGANISATION && !contextCan(ctx, PERMISSIONS.CONTACTS_UPDATE_ORG)) {
        // Fall back to personal scope rather than failing the whole request.
        scope = CONTACT_SCOPES.PERSONAL;
      }

      const check = validateContact(body);
      if (!check.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", check.errors);
      }

      const { rows } = await query(
        `INSERT INTO contacts (organisation_id, owner_user_id, scope, full_name, display_name, company, department,
                               phone, phone2, phone_normalized, email, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          organisationId,
          scope === CONTACT_SCOPES.PERSONAL ? ctx.user.id : null,
          scope,
          body.fullName.trim(),
          optionalString(body, "displayName", { max: 80 }) || body.fullName.trim(),
          optionalString(body, "company", { max: 120 }),
          optionalString(body, "department", { max: 120 }),
          optionalString(body, "phone", { max: 32 }),
          optionalString(body, "phone2", { max: 32 }),
          normalisedPhone(body.phone, body.phone2),
          optionalString(body, "email", { max: 254 }),
          optionalString(body, "notes", { max: 2000 }),
          ctx.user.id,
        ]
      );

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "contact.create",
        resourceType: "contact",
        resourceId: rows[0].id,
        metadata: { scope, fullName: rows[0].full_name },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      created(ctx.res, publicContact(rows[0]), { requestId: ctx.requestId });
    },
  },

  {
    method: "PATCH",
    path: "/contacts/:id",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const contact = await loadContact(organisationId, ctx.params.id);
      if (!canModifyContact(ctx, contact)) {
        throw new ApiError(403, "FORBIDDEN", "You cannot modify this contact.");
      }

      const body = ctx.body || {};
      const merged = { ...publicContact(contact), ...body };
      const check = validateContact(merged);
      if (!check.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", check.errors);
      }

      const fields = {
        full_name: body.fullName?.trim(),
        display_name: body.displayName !== undefined ? optionalString(body, "displayName", { max: 80 }) : undefined,
        company: body.company !== undefined ? optionalString(body, "company", { max: 120 }) : undefined,
        department: body.department !== undefined ? optionalString(body, "department", { max: 120 }) : undefined,
        phone: body.phone !== undefined ? optionalString(body, "phone", { max: 32 }) : undefined,
        phone2: body.phone2 !== undefined ? optionalString(body, "phone2", { max: 32 }) : undefined,
        email: body.email !== undefined ? optionalString(body, "email", { max: 254 }) : undefined,
        notes: body.notes !== undefined ? optionalString(body, "notes", { max: 2000 }) : undefined,
      };

      const updates = [];
      const params = [contact.id];
      for (const [column, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        params.push(value);
        updates.push(`${column} = $${params.length}`);
      }
      if (fields.phone !== undefined || fields.phone2 !== undefined) {
        params.push(
          normalisedPhone(
            fields.phone !== undefined ? fields.phone : contact.phone,
            fields.phone2 !== undefined ? fields.phone2 : contact.phone2
          )
        );
        updates.push(`phone_normalized = $${params.length}`);
      }
      if (!updates.length) throw new ApiError(422, "VALIDATION_ERROR", "No updatable fields were supplied.");
      updates.push("updated_at = now()");

      const { rows } = await query(`UPDATE contacts SET ${updates.join(", ")} WHERE id = $1 RETURNING *`, params);

      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "contact.update",
        resourceType: "contact",
        resourceId: contact.id,
        metadata: { fields: Object.keys(body || {}) },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, publicContact(rows[0]), { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/contacts/:id/favourite",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const contact = await loadContact(organisationId, ctx.params.id);
      const isOwner = contact.owner_user_id === ctx.user.id;
      const orgWide = contact.scope === CONTACT_SCOPES.ORGANISATION && !contact.owner_user_id;
      if (!orgWide && !isOwner && !contextCan(ctx, PERMISSIONS.CONTACTS_READ)) {
        throw new ApiError(404, "NOT_FOUND", "Contact not found.");
      }
      await query(
        `INSERT INTO contact_favourites (user_id, contact_id, organisation_id)
         VALUES ($1, $2, $3) ON CONFLICT (user_id, contact_id) DO NOTHING`,
        [ctx.user.id, contact.id, organisationId]
      );
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "contact.favourite",
        resourceType: "contact",
        resourceId: contact.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { contactId: contact.id, isFavourite: true }, { requestId: ctx.requestId });
    },
  },

  {
    method: "DELETE",
    path: "/contacts/:id/favourite",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const contact = await loadContact(organisationId, ctx.params.id);
      await query(`DELETE FROM contact_favourites WHERE user_id = $1 AND contact_id = $2`, [ctx.user.id, contact.id]);
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "contact.unfavourite",
        resourceType: "contact",
        resourceId: contact.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { contactId: contact.id, isFavourite: false }, { requestId: ctx.requestId });
    },
  },

  {
    method: "DELETE",
    path: "/contacts/:id",
    auth: "session",
    handle: async (ctx) => {
      const organisationId = requireOrganisation(ctx);
      const contact = await loadContact(organisationId, ctx.params.id);
      if (!canDeleteContact(ctx, contact)) {
        throw new ApiError(403, "FORBIDDEN", "You cannot delete this contact.");
      }
      await query(`DELETE FROM contacts WHERE id = $1`, [contact.id]);
      await audit({
        organisationId,
        userId: ctx.user.id,
        action: "contact.delete",
        resourceType: "contact",
        resourceId: contact.id,
        metadata: { fullName: contact.full_name },
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      noContent(ctx.res);
    },
  },
];

export default createHandler(routes);
