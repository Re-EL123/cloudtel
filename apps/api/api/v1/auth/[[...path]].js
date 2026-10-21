/**
 * Serverless function 1: Authentication
 * POST   /api/v1/auth/login
 * POST   /api/v1/auth/logout
 * GET    /api/v1/auth/session
 * POST   /api/v1/auth/refresh
 * POST   /api/v1/auth/password/forgot
 * POST   /api/v1/auth/password/reset-request   (alias of /password/forgot)
 * POST   /api/v1/auth/password/reset
 * POST   /api/v1/auth/password/change
 */
import { permissionsForRole, validateEmail, validatePassword } from "@cloudtel/shared";
import { success, ApiError } from "../../../lib/response.js";
import { createHandler } from "../../../lib/router.js";
import { query } from "../../../lib/database.js";
import {
  clearLoginFailures,
  clearSessionCookies,
  consumePasswordResetToken,
  createPasswordResetToken,
  createSession,
  findUserByEmail,
  hashPassword,
  isLocked,
  registerLoginFailure,
  revokeAllUserSessions,
  revokeSession,
  sessionCookie,
  csrfCookie,
  setCookieHeaders,
  touchSession,
  verifyPassword,
} from "../../../lib/authentication.js";
import { listUserMemberships } from "../../../lib/authorisation.js";
import { consumeRateLimit, rateLimitKey } from "../../../lib/rate-limit.js";
import { RATE_LIMITS } from "@cloudtel/shared";
import { audit } from "../../../lib/audit.js";
import { requireString, optionalString } from "../../../lib/validation.js";

async function sessionPayload(context) {
  const memberships = await listUserMemberships(context.user.id);
  const role = context.role;
  const activeOrganisation = memberships.find((m) => m.organisation_id === context.organisationId) || memberships[0] || null;
  return {
    user: {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      isPlatformAdmin: context.user.isPlatformAdmin,
    },
    organisation: activeOrganisation
      ? {
          id: activeOrganisation.organisation_id,
          name: activeOrganisation.organisation_name,
          slug: activeOrganisation.organisation_slug,
        }
      : null,
    role,
    permissions: permissionsForRole(role),
    organisations: memberships.map((m) => ({
      id: m.organisation_id,
      name: m.organisation_name,
      slug: m.organisation_slug,
      role: m.role,
    })),
    sessionExpiresAt: context.session?.expiresAt || null,
  };
}

async function handlePasswordForgot(ctx) {
  const decision = await consumeRateLimit(rateLimitKey(["pw-forgot", ctx.ip]), RATE_LIMITS.PASSWORD_RESET);
  const email = optionalString(ctx.body, "email", { max: 254, allowEmpty: false }).toLowerCase();
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      email: emailCheck.message,
    });
  }

  const user = await findUserByEmail(email);
  let resetToken = null;
  if (user && user.status === "active") {
    const created = await createPasswordResetToken(user.id, ctx.ip);
    resetToken = created.token;
    await audit({
      userId: user.id,
      action: "auth.password_reset_requested",
      resourceType: "user",
      resourceId: user.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    await deliverPasswordResetEmail(user.email, resetToken);
  }

  // Always answer the same way so the endpoint cannot enumerate accounts.
  const data = {
    accepted: true,
    // Development convenience only: lets the flow be tested without SMTP.
    ...(process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_RESET_TOKENS === "true" && resetToken
      ? { devResetToken: resetToken }
      : {}),
  };
  void decision;
  success(ctx.res, data, { requestId: ctx.requestId });
}

const routes = [
  {
    method: "POST",
    path: "/auth/login",
    auth: "public",
    rateLimit: { windowMs: 15 * 60 * 1000, max: 10 },
    handle: async (ctx) => {
      const decision = await consumeRateLimit(
        rateLimitKey(["login", ctx.ip]),
        RATE_LIMITS.LOGIN,
        { failClosed: true }
      );
      if (!decision.allowed) {
        ctx.res.setHeader("Retry-After", "900");
        throw new ApiError(429, "RATE_LIMITED", "Too many sign-in attempts. Try again in a few minutes.");
      }

      const email = requireString(ctx.body, "email", { max: 254, min: 3 }).toLowerCase();
      const password = requireString(ctx.body, "password", { max: 200, min: 1 });
      const emailCheck = validateEmail(email);
      if (!emailCheck.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          email: emailCheck.message,
        });
      }

      const user = await findUserByEmail(email);
      // Constant-ish response: never reveal whether the account exists.
      const genericFailure = new ApiError(401, "UNAUTHENTICATED", "Email address or password is incorrect.");

      if (!user || user.status !== "active" || !user.password_hash) {
        if (user) await registerLoginFailure(user);
        throw genericFailure;
      }
      if (isLocked(user)) {
        throw new ApiError(429, "RATE_LIMITED", "Account temporarily locked due to repeated failed sign-ins.");
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        const result = await registerLoginFailure(user);
        if (result.locked) {
          throw new ApiError(429, "RATE_LIMITED", "Account temporarily locked due to repeated failed sign-ins.");
        }
        throw genericFailure;
      }

      await clearLoginFailures(user.id);

      const memberships = await listUserMemberships(user.id);
      const requestedOrg = optionalString(ctx.body, "organisationId", { max: 64 });
      const chosenOrg =
        memberships.find((m) => m.organisation_id === requestedOrg) ||
        memberships[0] ||
        null;

      const session = await createSession({
        userId: user.id,
        organisationId: chosenOrg?.organisation_id || null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      setCookieHeaders(ctx.res, [
        sessionCookie(session.sessionToken, session.maxAgeSeconds),
        csrfCookie(session.csrfToken, session.maxAgeSeconds),
      ]);

      const role = user.is_platform_admin ? "platform_admin" : chosenOrg?.role || null;
      await audit({
        organisationId: chosenOrg?.organisation_id || null,
        userId: user.id,
        action: "auth.login",
        resourceType: "session",
        resourceId: session.sessionId,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });

      const context = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isPlatformAdmin: user.is_platform_admin,
        },
        organisationId: chosenOrg?.organisation_id || null,
        role,
        session: { expiresAt: session.expiresAt },
      };
      const payload = await sessionPayload(context);
      success(ctx.res, { ...payload, csrfToken: session.csrfToken }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/auth/logout",
    auth: "session",
    handle: async (ctx) => {
      await revokeSession(ctx.sessionToken);
      setCookieHeaders(ctx.res, clearSessionCookies());
      await audit({
        organisationId: ctx.organisationId,
        userId: ctx.user.id,
        action: "auth.logout",
        resourceType: "session",
        resourceId: ctx.session.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { signedOut: true }, { requestId: ctx.requestId });
    },
  },

  {
    method: "GET",
    path: "/auth/session",
    auth: "session",
    handle: async (ctx) => {
      const payload = await sessionPayload(ctx);
      // Include the CSRF token in the body so cross-origin frontends (whose JS
      // cannot read a cookie scoped to the API origin) can echo it back in the
      // x-csrf-token header.
      success(ctx.res, { ...payload, csrfToken: ctx.session.csrfToken }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/auth/refresh",
    auth: "session",
    handle: async (ctx) => {
      // Sliding-window refresh: touch the session then return a fresh payload.
      if (ctx.session?.id) await touchSession(ctx.session.id);
      const payload = await sessionPayload(ctx);
      success(ctx.res, { ...payload, csrfToken: ctx.session.csrfToken }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/auth/password/forgot",
    auth: "public",
    rateLimit: { windowMs: 60 * 60 * 1000, max: 5 },
    handle: handlePasswordForgot,
  },

  {
    method: "POST",
    path: "/auth/password/reset-request",
    auth: "public",
    rateLimit: { windowMs: 60 * 60 * 1000, max: 5 },
    handle: handlePasswordForgot,
  },

  {
    method: "POST",
    path: "/auth/password/reset",
    auth: "public",
    rateLimit: { windowMs: 15 * 60 * 1000, max: 10 },
    handle: async (ctx) => {
      const token = requireString(ctx.body, "token", { max: 200, min: 10 });
      const password = requireString(ctx.body, "password", { max: 200, min: 1 });
      const check = validatePassword(password);
      if (!check.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          password: check.message,
        });
      }

      const reset = await consumePasswordResetToken(token);
      const passwordHash = await hashPassword(password);
      await query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
        reset.user_id,
        passwordHash,
      ]);
      await revokeAllUserSessions(reset.user_id);
      await audit({
        userId: reset.user_id,
        action: "auth.password_reset_completed",
        resourceType: "user",
        resourceId: reset.user_id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { reset: true }, { requestId: ctx.requestId });
    },
  },

  {
    method: "POST",
    path: "/auth/password/change",
    auth: "session",
    handle: async (ctx) => {
      const currentPassword = requireString(ctx.body, "currentPassword", { max: 200, min: 1 });
      const newPassword = requireString(ctx.body, "newPassword", { max: 200, min: 1 });
      const check = validatePassword(newPassword);
      if (!check.valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
          newPassword: check.message,
        });
      }

      const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [ctx.user.id]);
      const valid = await verifyPassword(currentPassword, rows[0]?.password_hash);
      if (!valid) {
        throw new ApiError(422, "VALIDATION_ERROR", "Your current password is incorrect.", {
          currentPassword: "Current password is incorrect.",
        });
      }

      const passwordHash = await hashPassword(newPassword);
      await query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [ctx.user.id, passwordHash]);
      await revokeAllUserSessions(ctx.user.id);

      // Issue a fresh session so the user stays signed in after the change.
      const session = await createSession({
        userId: ctx.user.id,
        organisationId: ctx.organisationId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      setCookieHeaders(ctx.res, [
        sessionCookie(session.sessionToken, session.maxAgeSeconds),
        csrfCookie(session.csrfToken, session.maxAgeSeconds),
      ]);

      await audit({
        organisationId: ctx.organisationId,
        userId: ctx.user.id,
        action: "auth.password_changed",
        resourceType: "user",
        resourceId: ctx.user.id,
        ip: ctx.ip,
        requestId: ctx.requestId,
      });
      success(ctx.res, { changed: true, csrfToken: session.csrfToken }, { requestId: ctx.requestId });
    },
  },
];

/** Email delivery hook. Configure SMTP/provider in production. */
async function deliverPasswordResetEmail(email, token) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const link = `${appUrl}/login.html?mode=reset&token=${encodeURIComponent(token)}`;
  if (process.env.SMTP_URL) {
    try {
      // Intentionally dependency-free: operators can wire their provider in
      // this hook or forward the link through their transactional email service.
      console.log("password-reset: email delivery hook triggered", { email, link });
    } catch {
      /* delivery must never break the request */
    }
    return;
  }
  console.log("password-reset link generated", { email, link });
}

export default createHandler(routes);
