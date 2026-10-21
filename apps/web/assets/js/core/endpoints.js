/**
 * Convenience wrappers around the REST endpoints defined in
 * packages/shared/src/api-contracts.js. Features import these instead of
 * hand-writing paths.
 */
import { api } from "./api-client.js";

export const authApi = {
  login: (body) => api.post("/auth/login", body, { auth: false }),
  logout: () => api.post("/auth/logout", {}),
  session: () => api.get("/auth/session"),
  refresh: () => api.post("/auth/refresh", {}),
  requestReset: (email) => api.post("/auth/password/reset-request", { email }, { auth: false }),
  reset: (body) => api.post("/auth/password/reset", body, { auth: false }),
  changePassword: (body) => api.post("/auth/password/change", body),
};

export const usersApi = {
  me: () => api.get("/users/me"),
  updateMe: (body) => api.patch("/users/me", body),
  list: (query) => api.get("/users", query),
  get: (id) => api.get(`/users/${id}`),
  invite: (body) => api.post("/users/invitations", body),
  invitations: (query) => api.get("/users/invitations", query),
  update: (id, body) => api.patch(`/users/${id}`, body),
  remove: (id) => api.delete(`/users/${id}`),
  sessions: () => api.get("/users/me/sessions"),
  revokeSession: (id) => api.delete(`/users/me/sessions/${id}`),
};

export const organisationsApi = {
  current: () => api.get("/organisations/current"),
  update: (body) => api.patch("/organisations/current", body),
  listMine: () => api.get("/organisations/mine"),
  switch: (organisationId) => api.post("/organisations/switch", { organisationId }),
  list: (query) => api.get("/organisations", query),
  get: (id) => api.get(`/organisations/${id}`),
  updateById: (id, body) => api.patch(`/organisations/${id}`, body),
  members: (id, query) => api.get(`/organisations/${id}/members`, query),
  updateMember: (id, userId, body) => api.patch(`/organisations/${id}/members/${userId}`, body),
  removeMember: (id, userId) => api.delete(`/organisations/${id}/members/${userId}`),
};

export const extensionsApi = {
  list: (query) => api.get("/extensions", query),
  mine: () => api.get("/extensions/me"),
  get: (id) => api.get(`/extensions/${id}`),
  telephony: (id) => api.get(`/extensions/${id}/telephony`),
  create: (body) => api.post("/extensions", body),
  update: (id, body) => api.patch(`/extensions/${id}`, body),
  rotateCredentials: (id) => api.post(`/extensions/${id}/rotate`, {}),
  enable: (id) => api.post(`/extensions/${id}/enable`, {}),
  disable: (id) => api.post(`/extensions/${id}/disable`, {}),
  remove: (id) => api.delete(`/extensions/${id}`),
};

export const contactsApi = {
  list: (query) => api.get("/contacts", query),
  search: (query) => api.get("/contacts/search", query),
  favourites: () => api.get("/contacts/favourites"),
  create: (body) => api.post("/contacts", body),
  get: (id) => api.get(`/contacts/${id}`),
  update: (id, body) => api.patch(`/contacts/${id}`, body),
  remove: (id) => api.delete(`/contacts/${id}`),
  toggleFavourite: (id, favourite) =>
    favourite ? api.post(`/contacts/${id}/favourite`, {}) : api.delete(`/contacts/${id}/favourite`),
};

export const callsApi = {
  list: (query) => api.get("/calls", query),
  active: () => api.get("/calls/active"),
  voicemail: (query) => api.get("/calls/voicemail", query),
  stats: (query) => api.get("/calls/stats", query),
  export: (query) => api.get("/calls/export", query),
  get: (id) => api.get(`/calls/${id}`),
  usage: (id) => api.get(`/calls/${id}/usage`),
  start: (body) => api.post("/calls", body),
  update: (id, body) => api.patch(`/calls/${id}`, body),
};

export const callControlApi = {
  answer: (callId) => api.post(`/call-control/${callId}/answer`, {}),
  hangup: (callId) => api.post(`/call-control/${callId}/hangup`, {}),
  hold: (callId) => api.post(`/call-control/${callId}/hold`, {}),
  resume: (callId) => api.post(`/call-control/${callId}/resume`, {}),
  mute: (callId, muted) => api.post(`/call-control/${callId}/mute`, { muted }),
  holdStatus: (callId) => api.get(`/call-control/${callId}/hold`),
  transfer: (callId, body) => api.post(`/call-control/${callId}/transfer`, body),
  dtmf: (callId, digits) => api.post(`/call-control/${callId}/dtmf`, { digits }),
  device: (body) => api.post("/call-control/device", body),
};

export const settingsApi = {
  get: () => api.get("/settings"),
  update: (body) => api.patch("/settings", body),
  telephony: () => api.get("/settings/telephony"),
  updateTelephony: (body) => api.patch("/settings/telephony", body),
  audio: () => api.get("/settings/audio"),
  updateAudio: (body) => api.patch("/settings/audio", body),
  notifications: () => api.get("/settings/notifications"),
  updateNotifications: (body) => api.patch("/settings/notifications", body),
};

export const adminApi = {
  dashboard: () => api.get("/admin/dashboard"),
  usage: (query) => api.get("/admin/usage", query),
  auditLogs: (query) => api.get("/admin/audit-logs", query),
  suspendUser: (id) => api.post(`/admin/users/${id}/suspend`, {}),
  revokeExtension: (id) => api.post(`/admin/extensions/${id}/revoke`, {}),
};

export const billingApi = {
  plan: () => api.get("/billing/plan"),
  usage: () => api.get("/billing/usage"),
  checkout: (plan) => api.post("/billing/checkout", { plan }),
  portal: () => api.post("/billing/portal", {}),
};

export const healthApi = {
  check: () => api.get("/health"),
};
