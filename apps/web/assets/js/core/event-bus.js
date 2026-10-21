/**
 * Minimal typed event bus. Features and the shell communicate through this
 * instead of reaching into each other's modules.
 */

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  const handlers = listeners.get(event);
  if (!handlers) return;
  for (const handler of [...handlers]) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[event-bus] handler failed for "${event}"`, err);
    }
  }
}

export function once(event, handler) {
  const unsubscribe = on(event, (payload) => {
    unsubscribe();
    handler(payload);
  });
  return unsubscribe;
}
