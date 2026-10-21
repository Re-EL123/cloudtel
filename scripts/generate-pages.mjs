#!/usr/bin/env node
/**
 * Generate the repetitive parts of the CloudTel HTML pages from a single
 * shell template. Pages keep bespoke <main> content but share head, sidebar,
 * header, status bar and footer. Run after editing the template below.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps/web");

function head({ title, extraCss = [] }) {
  return `  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title} · CloudTel</title>
    <meta name="description" content="CloudTel — business softphone by Re-EL Branding & Technologies." />
    <meta name="theme-color" content="#38BDF8" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="/assets/img/favicon.ico" sizes="any" />
    <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png" />
    <link rel="manifest" href="/assets/manifest.webmanifest" />
    <link rel="preload" href="/assets/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/assets/css/tokens.css" />
    <link rel="stylesheet" href="/assets/css/reset.css" />
    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/themes.css" />
    <link rel="stylesheet" href="/assets/css/layout.css" />
    <link rel="stylesheet" href="/assets/css/components.css" />
${extraCss.map((href) => `    <link rel="stylesheet" href="${href}" />`).join("\n")}
    <link rel="stylesheet" href="/assets/css/responsive.css" />
    <script type="module">
      import { initTheme } from "/assets/js/core/preferences.js";
      initTheme();
    </script>
  </head>`;
}

const HEADER = `      <header class="app-header">
        <button type="button" class="header-icon-btn nav-toggle" aria-label="Open navigation" aria-expanded="false">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div class="input-group header-search">
          <span class="input-group-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input class="input header-search-input" type="search" placeholder="Search contacts…" aria-label="Search contacts" />
        </div>
        <div class="grow"></div>
        <button type="button" class="header-icon-btn header-help" aria-label="Help">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </button>
        <button type="button" class="header-icon-btn header-notifications" aria-label="Notifications">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </button>
        <button type="button" class="header-user-btn">
          <span class="header-user-avatar"></span>
          <span class="header-user-name">Account</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </header>`;

function appShell({ body, skipLabel }) {
  return `    <a class="skip-link" href="#main">${skipLabel}</a>
    <div class="app">
      <div class="sidebar-backdrop"></div>
      <aside class="app-sidebar">
        <div class="app-brand">
          <img src="/assets/img/logo.svg" alt="" />
          <div class="app-brand-name">Cloud<span>Tel</span></div>
        </div>
        <nav class="app-nav" aria-label="Primary"></nav>
        <div class="app-sidebar-footer"></div>
      </aside>

${HEADER}

      <main class="app-main" id="main">
${body}
      </main>

      <footer class="app-statusbar" role="status"></footer>
    </div>

    <div class="toast-region" role="region" aria-label="Notifications" aria-live="polite"></div>

    <script type="module" src="/assets/js/pages/PAGE_BOOTSTRAP.js"></script>
    <script>
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("/assets/sw.js").catch(() => {}));
      }
    </script>
  </body>
</html>`;
}

const PAGES = [
  {
    file: "contacts.html",
    title: "Contacts",
    css: ["/assets/css/contacts.css"],
    bootstrap: "contacts",
    skipLabel: "Skip to contacts",
    main: `        <div class="page" data-contacts-root></div>`,
  },
  {
    file: "history.html",
    title: "Call history",
    css: ["/assets/css/history.css"],
    bootstrap: "history",
    skipLabel: "Skip to call history",
    main: `        <div class="page" data-history-root></div>`,
  },
  {
    file: "voicemail.html",
    title: "Voicemail",
    css: ["/assets/css/history.css"],
    bootstrap: "voicemail",
    skipLabel: "Skip to voicemail",
    main: `        <div class="page" data-voicemail-root></div>`,
  },
  {
    file: "team.html",
    title: "Team",
    css: ["/assets/css/contacts.css"],
    bootstrap: "team",
    skipLabel: "Skip to team",
    main: `        <div class="page" data-team-root></div>`,
  },
  {
    file: "settings.html",
    title: "Settings",
    css: ["/assets/css/settings.css"],
    bootstrap: "settings",
    skipLabel: "Skip to settings",
    main: `        <div class="page" data-settings-root></div>`,
  },
  {
    file: "admin.html",
    title: "Administration",
    css: ["/assets/css/admin.css"],
    bootstrap: "admin",
    skipLabel: "Skip to administration",
    main: `        <div class="page" data-admin-root></div>`,
  },
];

async function main() {
  for (const page of PAGES) {
    const html = `<!doctype html>
<html lang="en" data-theme="light">
${head({ title: page.title, extraCss: page.css })}
  <body>
${appShell({ body: page.main, skipLabel: page.skipLabel }).replace("PAGE_BOOTSTRAP", page.bootstrap)}
`;
    await writeFile(path.join(webDir, page.file), html);
    console.log("wrote", page.file);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
