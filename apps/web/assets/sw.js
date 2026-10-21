/* CloudTel service worker: offline shell for static assets.
   Never cache API responses or SIP traffic — those are live by nature. */

const VERSION = "cloudtel-v3";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = [
  "/config.json",
  "/login.html",
  "/dialer.html",
  "/contacts.html",
  "/history.html",
  "/voicemail.html",
  "/team.html",
  "/settings.html",
  "/admin.html",
  "/assets/js/core/app-shell.js",
  "/assets/js/core/api-client.js",
  "/assets/js/core/config.js",
  "/assets/js/core/preferences.js",
  "/assets/css/tokens.css",
  "/assets/css/reset.css",
  "/assets/css/base.css",
  "/assets/css/themes.css",
  "/assets/css/layout.css",
  "/assets/css/components.css",
  "/assets/css/dialer.css",
  "/assets/css/contacts.css",
  "/assets/css/history.css",
  "/assets/css/settings.css",
  "/assets/css/admin.css",
  "/assets/css/responsive.css",
  "/assets/manifest.webmanifest",
  "/assets/img/logo.svg",
  "/assets/img/logo.png",
  "/assets/img/favicon.svg",
  "/assets/img/placeholder-avatar.svg",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch API, SIP, or cross-origin requests.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // Runtime configuration must always be fresh (network-first), so editing
  // config.json takes effect without a cache purge.
  if (url.pathname.endsWith("/config.json")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("/offline.html"));
      return cached || network;
    })
  );
});
