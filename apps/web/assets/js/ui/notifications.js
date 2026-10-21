/**
 * CloudTel notification bus.
 * The feature layer publishes toast requests; apps/web registers a renderer
 * (components/toast.js) so this package stays framework-free.
 */

export const NOTIFY_TYPES = Object.freeze({
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
});

let renderer = null;
const queue = [];

/** Register the platform toast renderer. Pending notifications flush on set. */
export function setNotificationRenderer(fn) {
  renderer = typeof fn === "function" ? fn : null;
  while (queue.length && renderer) {
    const item = queue.shift();
    renderer(item);
  }
}

/**
 * Publish a notification.
 * @param {{type?:string, message:string, title?:string, timeout?:number}} notification
 */
export function notify(notification = {}) {
  const type = notification.type || NOTIFY_TYPES.INFO;
  const item = {
    type,
    message: String(notification.message ?? ""),
    title: notification.title || "",
    timeout: notification.timeout ?? (type === NOTIFY_TYPES.ERROR ? 8000 : 4500),
  };
  if (!item.message) return;
  if (renderer) renderer(item);
  else queue.push(item);
}

export const notifySuccess = (message, title = "") => notify({ type: NOTIFY_TYPES.SUCCESS, message, title });
export const notifyError = (message, title = "Something went wrong") =>
  notify({ type: NOTIFY_TYPES.ERROR, message, title });
export const notifyWarning = (message, title = "") => notify({ type: NOTIFY_TYPES.WARNING, message, title });
export const notifyInfo = (message, title = "") => notify({ type: NOTIFY_TYPES.INFO, message, title });
