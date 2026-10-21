# Design system

CloudTel's visual language is defined once in design tokens and consumed by both
the static SPA and the shared UI primitives. Never hard-code colours elsewhere.

## Tokens

`apps/web/assets/css/tokens.css` is the single source of truth.

| Token | Value | Use |
| --- | --- | --- |
| `--color-primary` | `#38BDF8` | primary brand sky blue |
| `--color-primary-hover` | `#0EA5E9` | hover / active |
| `--color-primary-deep` | `#0284C7` | pressed / emphasis |
| `--color-success` | green | positive states |
| `--color-warning` | amber | caution |
| `--color-danger` | red | destructive / errors |
| `--color-bg` / `--color-surface` | neutrals | layout |
| `--color-text` / `--color-text-muted` | neutrals | typography |
| `--radius-*`, `--space-*`, `--shadow-*`, `--font-*` | scale | spacing, depth, type |

Dark and light themes are driven by the same token names so components need no
theme-aware code.

## Call status is never colour-only

Call/registration status always pairs a colour with an icon **and** text label,
so it is legible to colour-blind users and screen readers. Status colours come
from `packages/shared/src/call-status.js`.

## Typography

Inter is self-hosted (`apps/web/assets/fonts/`) and preloaded. Sizes and weights
use the `--font-*` tokens.

## Components

UI primitives live in `packages/ui/src/` and use plain, documented class names
(`field`, `field-label`, `input-wrap`, `select`, `btn-label`, …). They are
mirrored into `apps/web/assets/js/ui/` by `npm run build`.

| Module | Provides |
| --- | --- |
| `buttons.js` | `createButton`, `setButtonBusy`, `toggleButton`, `BUTTON_VARIANTS` |
| `inputs.js` | `createField` (incl. `togglePassword`), `createSelectField`, `createTextareaField` |
| `dialogs.js` | `openDialog()` → `{ dialog, close, promise }`, `confirmDialog()` |
| `notifications.js` | `notify`, `notifySuccess/Error/Warning/Info`, `setNotificationRenderer` |

Toasts are wired up per page by `apps/web/assets/js/components/toast.js`
(`initToasts()`).

## Accessibility

- Interactive elements are real buttons/inputs with visible focus rings.
- Dialogs trap focus and restore it on close; `Esc` closes.
- Live regions announce call and toast updates.
- Motion respects `prefers-reduced-motion`.
- Contrast meets WCAG AA for text and status.

## Icons and branding

- Icons are inline Lucide SVG paths (`apps/web/assets/js/components/icons.js`) —
  no icon font, no network request.
- The logo is `logo.png` (source of truth). `npm run generate:icons` regenerates
  the PWA icons and favicon from it.
- The marketing name is always **CloudTel**; attribution "By Re-EL" is allowed
  in footers/about only.

## PWA

`apps/web/assets/manifest.webmanifest` and `assets/sw.js` provide installability
and offline caching. Bump the service-worker cache name when shipping breaking
asset changes (`cloudtel-v2` → `v3`).
