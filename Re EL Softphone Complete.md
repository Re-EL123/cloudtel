# Re-EL Softphone — Complete Product, Design & Technical Specification

**Product:** Re-EL Softphone  
**Company:** Re-EL Branding & Technologies  
**Product category:** Browser-based VoIP softphone and business communications platform  
**Architecture:** Monorepo  
**Frontend:** HTML5, CSS3, JavaScript  
**API:** Vercel Serverless Functions  
**Database:** PostgreSQL  
**Telephony:** SIP.js, WebRTC, Asterisk  
**Primary colour:** Sky blue  
**Deployment model:** Vercel + PostgreSQL provider + Ubuntu VPS for telephony

## 1. Product vision

Re-EL Softphone will be a professional, browser-based telephone application that allows individuals and businesses to make and receive internet-based calls without installing traditional desktop softphone software.

The product will combine a modern calling interface with business communication features, user management, contacts, call history, and configurable telephone extensions.

The platform should be developed as a reusable product under the Re-EL brand, with the architecture supporting multiple businesses and organisations in the future.

### 1.1 Core objectives

1. Provide a professional browser-based calling experience.
2. Support SIP-based calling through WebRTC.
3. Enable communication between registered internal extensions.
4. Support external mobile and landline calls through a compatible SIP trunk.
5. Provide a secure Vercel Serverless API for application operations.
6. Maintain persistent business data in PostgreSQL.
7. Support multiple organisations, users, and extensions.
8. Provide responsive interfaces for desktop, tablet, and mobile browsers.
9. Support future integration with Re-EL products.
10. Keep infrastructure modular, maintainable, and cost-conscious.

### 1.2 Product principles

- **Browser first:** Users should not need to install a traditional desktop client.
- **Security first:** Authentication, tenant isolation, and telephone-use restrictions are mandatory.
- **Modular:** Frontend, API, database, and telephony components must remain logically separated.
- **Serverless application API:** Vercel handles ordinary application requests, not persistent telephony processes.
- **Progressive delivery:** Internal calling must work before external calling and commercial billing are introduced.
- **Production-oriented:** Development shortcuts must not compromise credentials, access control, or call routing.

---

# 2. Scope and feature specification

The application will have five primary areas:

1. Softphone and call controls.
2. Contacts and call history.
3. User account and audio settings.
4. Organisation and extension administration.
5. Platform administration and commercial management.

## 2.1 Core feature requirements

| ID | Feature | Specification | Priority |
|---|---|---|---|
| FR-001 | Authentication | Secure login, logout, session validation, and password recovery | P0 |
| FR-002 | User profiles | Manage names, email addresses, preferences, and account status | P0 |
| FR-003 | Dialer | Enter telephone numbers using a keypad or keyboard | P0 |
| FR-004 | SIP registration | Register authorised users with the PBX | P0 |
| FR-005 | Outgoing calls | Initiate permitted SIP calls | P0 |
| FR-006 | Incoming calls | Receive and display incoming call information | P0 |
| FR-007 | Answer and decline | Accept or reject incoming calls | P0 |
| FR-008 | Hang up | End an active call | P0 |
| FR-009 | Mute | Toggle the local microphone | P0 |
| FR-010 | Audio devices | Select available microphones and output devices where supported | P0 |
| FR-011 | Call history | Display incoming, outgoing, missed, and failed calls | P0 |
| FR-012 | Contacts | Create, search, edit, and delete contacts | P0 |
| FR-013 | Organisation isolation | Restrict users to authorised organisation data | P0 |
| FR-014 | Extension management | Assign and revoke telephone extensions | P0 |
| FR-015 | Call status | Display registration and call-connection states | P0 |
| FR-016 | Hold and resume | Hold and resume calls where supported by the PBX | P1 |
| FR-017 | DTMF | Send telephone keypad tones during calls | P1 |
| FR-018 | Call transfer | Transfer calls through supported SIP/PBX operations | P1 |
| FR-019 | Voicemail | Access voicemail through supported PBX functionality | P1 |
| FR-020 | Usage reporting | Display call duration and authorised usage information | P1 |
| FR-021 | External calling | Connect to public telephone numbers through a SIP trunk | P1 |
| FR-022 | Team directory | Search organisation users and extensions | P1 |
| FR-023 | Subscriptions | Manage plans and account entitlements | P2 |
| FR-024 | Call recording | Optional recording with appropriate consent and access controls | P2 |
| FR-025 | Call queues | Queue and distribute incoming calls | P2 |
| FR-026 | Auto-attendant | Route callers through automated menus | P2 |
| FR-027 | Conferencing | Support multi-party calls through compatible PBX functionality | P2 |
| FR-028 | Re-EL integrations | Integrate with selected Re-EL business products | P2 |

**Priority definitions**

- **P0:** Required for the first usable release.
- **P1:** Required for the expanded business-phone release.
- **P2:** Future commercial and enterprise capabilities.

The initial application should be usable with P0 functionality before P1 and P2 features are introduced.

---

# 3. Design system and brand identity

The interface will use a sky-blue visual identity that communicates clarity, reliability, and modern communications.

The design should feel like a premium business application rather than a generic telephone keypad.

## 3.1 Colour palette

Use the following colours as the initial design tokens.

| Token | Hexadecimal | Usage |
|---|---|---|
| Primary | `#38BDF8` | Main buttons, active controls, selected navigation |
| Primary hover | `#0EA5E9` | Hover and pressed states |
| Primary deep | `#0284C7` | High-contrast emphasis and dark-theme accents |
| Primary light | `#E0F2FE` | Selected backgrounds and soft highlights |
| Primary pale | `#F0F9FF` | Light-theme accent surfaces |
| Background | `#F8FAFC` | Main application background |
| Surface | `#FFFFFF` | Cards, panels, and dialogs |
| Surface secondary | `#F1F5F9` | Secondary panels and input backgrounds |
| Text primary | `#0F172A` | Main headings and body text |
| Text secondary | `#475569` | Supporting information |
| Text muted | `#64748B` | Secondary metadata |
| Border | `#E2E8F0` | Card borders and dividers |
| Success | `#16A34A` | Connected status and successful operations |
| Warning | `#D97706` | Warnings and pending operations |
| Danger | `#DC2626` | Decline, hang-up, and destructive actions |
| Info | `#0284C7` | Informational states |

### Colour usage rules

- Sky blue is the primary interactive colour.
- Use white surfaces and slate text for readable light-theme layouts.
- Use the danger colour for the hang-up action and destructive controls.
- Never communicate call status through colour alone; pair colours with labels or icons.
- Ensure buttons, text, focus indicators, and status indicators meet appropriate accessibility contrast requirements.
- Avoid large, saturated sky-blue backgrounds behind long blocks of text.

### Dark theme

The dark theme should retain the same identity while using darker surfaces.

| Token | Hexadecimal |
|---|---|
| Background | `#0B1220` |
| Main surface | `#111827` |
| Secondary surface | `#1E293B` |
| Border | `#334155` |
| Primary text | `#F8FAFC` |
| Secondary text | `#CBD5E1` |
| Accent | `#38BDF8` |

The theme should be switchable through the application settings and persist across sessions.

## 3.2 Typography

Recommended typeface: **Inter**.

Typography hierarchy:

| Element | Suggested size | Weight |
|---|---:|---:|
| Page heading | 24–30 px | 700 |
| Section heading | 18–20 px | 600 |
| Card heading | 15–17 px | 600 |
| Body text | 14–16 px | 400 |
| Secondary text | 12–14 px | 400 |
| Button label | 14–15 px | 600 |
| Dialled number | 28–36 px | 500 |
| Call timer | 24–32 px | 600 |

Use a consistent spacing scale based on 4 px increments.

## 3.3 UI component styling

- Card radius: 12–16 px.
- Button radius: 8–12 px.
- Input radius: 8–10 px.
- Standard control height: 40–44 px.
- Primary call control: approximately 56 px.
- Minimum comfortable touch target: 44 × 44 CSS pixels.
- Panel shadows: subtle, with borders providing the primary separation.
- Animations: generally 150–250 ms.
- Focus indicators: visible sky-blue outline with sufficient contrast.

Use Lucide icons for calling, contacts, settings, history, notifications, and navigation.

Avoid excessive gradients, glass effects, or animations that distract from active calls.

---

# 4. User interface and UX specification

## 4.1 Main application layout

The desktop application will use a three-column layout with a compact navigation sidebar, a primary workspace, and an optional contextual panel.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ RE-EL SOFTPHONE      Search contacts...            Help   Notifications  AS  │
├───────────────┬──────────────────────────────────────┬───────────────────────┤
│               │                                      │                       │
│  WORKSPACE    │  SOFTPHONE                           │  CONTACTS             │
│               │                                      │                       │
│  Dialer       │  Registration: Connected             │  Search contacts...   │
│  Contacts     │                                      │                       │
│  Call history │  ┌──────────────────────────────┐    │  Recent contacts     │
│  Voicemail    │  │                              │    │                       │
│               │  │       Enter a number         │    │  John Smith           │
│  ───────────  │  │                              │    │  082 XXX XXXX         │
│               │  └──────────────────────────────┘    │                       │
│  DIRECTORY    │                                      │  Jane Doe             │
│  Team         │        1       2       3             │  083 XXX XXXX         │
│  Extensions   │        4       5       6             │                       │
│               │        7       8       9             │                       │
│  ───────────  │        *       0       #             │                       │
│               │                                      │                       │
│  SETTINGS     │    [ Call ]    [ Clear ]             │                       │
│  Preferences  │                                      │                       │
│  Account      │                                      │                       │
│               │                                      │                       │
├───────────────┴──────────────────────────────────────┴───────────────────────┤
│ Audio ready   Microphone: Default   Speaker: Default   Network: Connected   │
└──────────────────────────────────────────────────────────────────────────────┘
```

The right panel should be collapsible. On smaller displays, the layout must transition to a single primary column.

### Application shell requirements

The shell must provide:

- Persistent navigation.
- A consistent header.
- A global connection-status indicator.
- A user profile menu.
- Notification access.
- Context-sensitive content.
- A bottom audio-status strip on desktop.
- Responsive navigation for mobile.
- An optional compact mode for smaller screens.

The interface must not imply that a call is available simply because the user is logged in. SIP registration and application authentication are separate states.

## 4.2 Login screen

**Purpose:** Authenticate users before granting access to the phone system.

Components:
- Re-EL Softphone logo and wordmark.
- Welcome heading.
- Email address input.
- Password input with visibility toggle.
- Sign-in button.
- Password recovery link.
- Validation messages.
- Loading indicator.
- Authentication error messages.
- Optional organisation branding.

Requirements:
- Validate input on both client and server.
- Prevent repeated login attempts through appropriate rate limiting.
- Avoid revealing whether a particular email address exists.
- Use secure sessions.
- Redirect authenticated users to their permitted landing page.
- Require account activation where configured.

Do not request SIP credentials on the general login screen unless the selected telephony architecture explicitly requires a separate credential-management workflow.

## 4.3 Dialer screen

The dialer is the application's primary workspace.

### Number input

The number input must support:

- Manual keyboard entry.
- On-screen keypad entry.
- Copy and paste.
- Backspace.
- Clear-all.
- International telephone number formats.
- Extension entry.
- Contact lookup.
- Click-to-call from supported application screens.

The application must normalise numbers according to the configured numbering rules without silently changing the user's intended destination.

For South African telephone numbers, allow common local and international formats. Store normalised external telephone numbers in a consistent format, preferably E.164 when the number can be validly normalised.

### Keypad

Display the standard 12-key telephone keypad:

| 1 | 2 ABC | 3 DEF |
|---|---|---|
| 4 GHI | 5 JKL | 6 MNO |
| 7 PQRS | 8 TUV | 9 WXYZ |
| `*` | 0 `+` | `#` |

The plus sign may be entered using a long press or a dedicated control if the layout supports it.

Requirements:
- Each key must have a visible hover and pressed state.
- Keys must work with mouse, touch, and keyboard input.
- Keyboard shortcuts must not interfere with normal text entry.
- DTMF transmission must occur only during an appropriate active call.
- The keypad must remain accessible during calls when needed for automated menus.

### Primary controls

- **Call:** Initiates a call after validating the destination and account permissions.
- **Clear:** Clears the number input.
- **Backspace:** Removes the last character.
- **Contacts:** Opens contact search.
- **Call history:** Opens recent calls.

The Call button should be disabled when the destination is invalid, the SIP client is unavailable, or the account is not authorised to make calls.

## 4.4 Incoming-call interface

Incoming calls should be noticeable without unnecessarily obstructing the user's work.

Display:
- Caller name, if known.
- Caller number.
- Organisation or extension information, where available.
- Incoming-call indicator.
- Answer button.
- Decline button.
- Optional ringtone.
- Browser notification when permitted.

Use a modal or prominent call panel on desktop and a full-screen call interface on small mobile screens.

The application must handle incoming-call races, such as a call being answered on another registered device.

If the call is no longer available, remove the answer action and explain the updated state.

## 4.5 Active-call interface

The active-call interface should prioritise the caller's identity and the most frequently used controls.

```text
┌─────────────────────────────────────┐
│                                     │
│          ACTIVE CALL                │
│                                     │
│             JS                      │
│                                     │
│         John Smith                  │
│         082 XXX XXXX                │
│                                     │
│             04:32                   │
│                                     │
│     [ Mute ]      [ Hold ]          │
│                                     │
│    [ Keypad ]    [ Transfer ]       │
│                                     │
│          [ End Call ]               │
│                                     │
└─────────────────────────────────────┘
```

Required information:
- Caller identity.
- Call duration.
- Call state.
- Audio connection state where available.
- Microphone state.
- Hold state.

Controls:
- Mute/unmute.
- Hold/resume.
- DTMF keypad.
- Transfer, when supported.
- End call.

The call timer should be based on the call's established start time and a monotonic or equivalent timing mechanism, rather than repeatedly incrementing a counter without accounting for background-tab suspension.

A call must not be considered successfully established merely because the outgoing request was sent. The UI should reflect the actual signalling state.

## 4.6 Contacts screen

Provide:
- Contact search.
- Alphabetical sorting.
- Recently contacted list.
- Contact details.
- Add contact.
- Edit contact.
- Delete contact.
- Click-to-call.
- Call history for the selected contact.
- Optional company and department fields.

Contact fields:

```text
Full name
Display name
Company
Department
Telephone number
Additional telephone number
Email address
Notes
Organisation ID
Created by
Created at
Updated at
```

Users must only be able to modify contacts within their authorised scope.

Support both organisation-wide contacts and personal contacts if the organisation's permissions allow both.

## 4.7 Call history screen

Call records should include:
- Direction.
- Caller.
- Recipient.
- Start time.
- End time, when available.
- Duration.
- Call outcome.
- Extension.
- Optional provider reference.
- Optional cost information where reliably available.

Call types:
- Incoming.
- Outgoing.
- Missed.
- Failed.
- Declined.
- Cancelled.

Provide:
- Search.
- Date-range filtering.
- Direction filters.
- Outcome filters.
- Pagination.
- Click-to-call.
- Contact creation from a call record.
- Detailed call information.

Do not classify every unanswered call as missed without considering the signalling outcome. For example, a user-initiated cancellation and a remote-party rejection should remain distinguishable where the PBX provides enough information.

## 4.8 Settings screen

Organise settings into sections.

**Audio**
- Microphone selection.
- Speaker selection where supported.
- Microphone permission status.
- Audio test.
- Echo or audio troubleshooting guidance.

**Calling**
- Default calling identity.
- Ringtone.
- Call confirmation options.
- Preferred number format.
- Supported call-handling preferences.

**Appearance**
- Light mode.
- Dark mode.
- System theme.
- Compact layout.

**Notifications**
- Incoming-call notifications.
- Browser notification permissions.
- Sound preferences.

**Account**
- Display name.
- Email.
- Password management.
- Active sessions where supported.
- Sign out.

**Network**
- SIP registration status.
- WebSocket connection status.
- Troubleshooting diagnostics.
- Last successful registration.

Do not expose internal credentials, private PBX endpoints, or sensitive diagnostic data to unauthorised users.

---

# 5. Responsive design specification

The interface must be usable on desktop, tablet, and mobile browsers.

| Breakpoint | Target | Layout |
|---|---|---|
| 320–479 px | Small mobile | Single column, compact dialer, full-screen active call |
| 480–767 px | Large mobile | Single column, collapsible navigation |
| 768–1023 px | Tablet | Two-column layout or collapsible side panel |
| 1024–1439 px | Desktop | Navigation, main workspace, optional contacts panel |
| 1440 px and above | Large desktop | Full workspace with contextual panel |

These are initial design breakpoints, not hard restrictions on supported device widths.

### Mobile requirements

- No horizontal page scrolling.
- Large call controls.
- Touch-friendly keypad.
- Sticky active-call controls where practical.
- Responsive contact search.
- Safe-area padding for supported mobile devices.
- Correct handling of browser permission prompts.
- Clear audio-device limitations when using mobile browsers.

**Important:** Browser calling on mobile is not equivalent to native telephony. Background operation, incoming-call delivery, and notification behaviour depend on the browser, operating system, and permissions. Do not promise reliable incoming calls when the browser is closed or suspended without implementing an appropriate supported mechanism.

---

# 6. Animation and interaction specification

Animations should communicate changes in state, not merely decorate the interface.

| Interaction | Behaviour |
|---|---|
| Navigation | Short transition when switching sections |
| Keypad | Brief pressed-state animation |
| Call initiation | Connecting indicator with clear status |
| Incoming call | Subtle pulsing indicator |
| Call connected | Transition from connecting to active |
| Mute | Icon and label update immediately |
| Hold | Clear held-state indicator |
| Call ended | Brief state transition before returning to the dialer |
| Contact selection | Smooth panel or detail transition |
| Notifications | Short slide or fade |
| Modal dialogs | Subtle opacity and transform transition |

Use CSS transitions for simple interface changes. Avoid running unnecessary animation loops during active calls.

Respect `prefers-reduced-motion` and ensure all call controls remain functional when animations are disabled.

---

# 7. Monorepo architecture

The repository will be named:

`re-el-softphone`

The monorepo will contain the frontend, Vercel API, shared utilities, database migrations, telephony configuration, documentation, and automated tests.

The structure should support independent development and deployment of the web application and telephony infrastructure.

## 7.1 Recommended repository structure

```text
re-el-softphone/
│
├── apps/
│   ├── web/
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── dialer.html
│   │   ├── contacts.html
│   │   ├── history.html
│   │   ├── voicemail.html
│   │   ├── team.html
│   │   ├── settings.html
│   │   ├── admin.html
│   │   │
│   │   ├── assets/
│   │   │   ├── css/
│   │   │   │   ├── tokens.css
│   │   │   │   ├── reset.css
│   │   │   │   ├── base.css
│   │   │   │   ├── layout.css
│   │   │   │   ├── components.css
│   │   │   │   ├── dialer.css
│   │   │   │   ├── calls.css
│   │   │   │   ├── contacts.css
│   │   │   │   ├── history.css
│   │   │   │   ├── settings.css
│   │   │   │   ├── admin.css
│   │   │   │   ├── responsive.css
│   │   │   │   └── themes.css
│   │   │   │
│   │   │   ├── js/
│   │   │   │   ├── app.js
│   │   │   │   ├── router.js
│   │   │   │   ├── config.js
│   │   │   │   │
│   │   │   │   ├── core/
│   │   │   │   │   ├── api-client.js
│   │   │   │   │   ├── auth.js
│   │   │   │   │   ├── session.js
│   │   │   │   │   ├── event-bus.js
│   │   │   │   │   ├── state.js
│   │   │   │   │   └── error-handler.js
│   │   │   │   │
│   │   │   │   ├── telephony/
│   │   │   │   │   ├── sip-client.js
│   │   │   │   │   ├── registration.js
│   │   │   │   │   ├── call-manager.js
│   │   │   │   │   ├── audio-manager.js
│   │   │   │   │   ├── dtmf.js
│   │   │   │   │   ├── call-controls.js
│   │   │   │   │   └── call-state.js
│   │   │   │   │
│   │   │   │   ├── features/
│   │   │   │   │   ├── dialer.js
│   │   │   │   │   ├── contacts.js
│   │   │   │   │   ├── call-history.js
│   │   │   │   │   ├── voicemail.js
│   │   │   │   │   ├── team.js
│   │   │   │   │   ├── settings.js
│   │   │   │   │   └── notifications.js
│   │   │   │   │
│   │   │   │   ├── components/
│   │   │   │   │   ├── button.js
│   │   │   │   │   ├── modal.js
│   │   │   │   │   ├── toast.js
│   │   │   │   │   ├── keypad.js
│   │   │   │   │   ├── contact-card.js
│   │   │   │   │   └── call-panel.js
│   │   │   │   │
│   │   │   │   └── utils/
│   │   │   │       ├── phone-number.js
│   │   │   │       ├── date-time.js
│   │   │   │       ├── validation.js
│   │   │   │       └── formatting.js
│   │   │   │
│   │   │   ├── icons/
│   │   │   ├── sounds/
│   │   │   ├── manifest.json
│   │   │   └── service-worker.js
│   │   │
│   │   └── README.md
│   │
│   └── api/
│       ├── api/
│       │   └── v1/
│       │       ├── auth.js
│       │       ├── users.js
│       │       ├── organisations.js
│       │       ├── extensions.js
│       │       ├── contacts.js
│       │       ├── calls.js
│       │       ├── call-control.js
│       │       ├── settings.js
│       │       ├── admin.js
│       │       ├── webhooks.js
│       │       ├── billing.js
│       │       └── health.js
│       │
│       ├── lib/
│       │   ├── database.js
│       │   ├── authentication.js
│       │   ├── authorisation.js
│       │   ├── validation.js
│       │   ├── rate-limit.js
│       │   ├── audit.js
│       │   ├── pbx-client.js
│       │   └── response.js
│       │
│       ├── package.json
│       ├── vercel.json
│       └── README.md
│
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── constants.js
│   │   │   ├── roles.js
│   │   │   ├── permissions.js
│   │   │   ├── call-status.js
│   │   │   ├── validation-rules.js
│   │   │   └── api-contracts.js
│   │   └── package.json
│   │
│   ├── ui/
│   │   ├── src/
│   │   │   ├── buttons.js
│   │   │   ├── inputs.js
│   │   │   ├── dialogs.js
│   │   │   └── notifications.js
│   │   └── package.json
│   │
│   └── config/
│       ├── eslint/
│       └── prettier/
│
├── database/
│   ├── schema.sql
│   ├── migrations/
│   ├── seeds/
│   └── README.md
│
├── telephony/
│   ├── asterisk/
│   │   ├── pjsip.conf.example
│   │   ├── extensions.conf.example
│   │   ├── http.conf.example
│   │   ├── ari.conf.example
│   │   └── rtp.conf.example
│   │
│   ├── scripts/
│   │   ├── validate-config.sh
│   │   └── deployment-check.sh
│   │
│   └── README.md
│
├── docs/
│   ├── architecture.md
│   ├── design-system.md
│   ├── api-reference.md
│   ├── database-schema.md
│   ├── security.md
│   ├── deployment.md
│   ├── telephony.md
│   ├── troubleshooting.md
│   └── disaster-recovery.md
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── api/
│   ├── security/
│   └── e2e/
│
├── scripts/
│   ├── dev.sh
│   ├── test.sh
│   └── validate.sh
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── security.yml
│
├── .gitignore
├── .editorconfig
├── .env.example
├── package.json
├── package-lock.json
├── vercel.json
├── README.md
└── LICENSE
```

### Monorepo implementation notes

This is a logical repository layout. The deployment configuration must be adapted to the selected Vercel project root and build settings.

In particular:

- `apps/web` contains the browser application.
- `apps/api` contains the Vercel API application.
- `packages/shared` contains code that can safely be shared between the browser and server.
- `packages/ui` contains reusable interface components.
- `database` contains versioned schema changes.
- `telephony` contains example configurations and operational scripts, not production secrets.
- `docs` contains the technical and operational documentation.

Do not copy secret-bearing production configuration files into the repository.

### Recommended monorepo tooling

Use npm workspaces initially. They are sufficient for a JavaScript monorepo without introducing unnecessary infrastructure.

Example root `package.json`:

```json
{
  "name": "re-el-softphone",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/api",
    "packages/shared",
    "packages/ui",
    "packages/config"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=apps/api",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "validate": "npm run validate --workspaces --if-present"
  }
}
```

The frontend can remain a static HTML/CSS/JavaScript application. It does not need to be converted to React or TypeScript to support this architecture.

The `dev` script is only a starting point; configure it to launch the frontend development server as well if the chosen local development setup requires one.

---

# 8. Frontend architecture

The frontend should use feature-based JavaScript modules, with a clear separation between presentation, application state, API communication, and telephony.

## 8.1 Architectural layers

| Layer | Responsibility |
|---|---|
| UI components | Buttons, dialogs, keypad, cards, menus |
| Page modules | Dialer, contacts, history, settings |
| Application state | Authentication state, selected contact, current call |
| API client | HTTP requests to Vercel |
| Telephony client | SIP registration, call sessions, signalling |
| Audio manager | Microphone and supported output-device selection |
| Utilities | Number formatting, validation, dates, error formatting |

### Core frontend rules

1. UI components must not make database requests directly.
2. All application API requests must pass through the shared API client.
3. SIP operations must pass through the telephony module.
4. UI state must reflect actual telephony events.
5. Call state must not depend solely on button clicks.
6. Authentication and SIP registration must have independent state machines.
7. All asynchronous operations must handle failures.
8. Event listeners must be removed when components are disposed.
9. Sensitive credentials must never be written to console logs.
10. The interface must remain usable if contacts or call history are temporarily unavailable.

## 8.2 Application state model

Maintain separate state objects for authentication, network connectivity, and telephony.

Example:

```javascript
const appState = {
  auth: {
    status: "unauthenticated",
    user: null,
    organisation: null
  },

  network: {
    api: "unknown",
    sip: "disconnected"
  },

  telephony: {
    registration: "unregistered",
    callState: "idle",
    activeCall: null,
    microphoneMuted: false,
    isOnHold: false
  },

  ui: {
    theme: "system",
    activePage: "dialer",
    contactsPanelOpen: true
  }
};
```

These values illustrate the desired structure. Production code should validate state transitions and use controlled state updates rather than allowing unrelated modules to mutate the object arbitrarily.

### Authentication states

```text
UNAUTHENTICATED
       |
       v
AUTHENTICATING
       |
       +------ Failure ------> UNAUTHENTICATED
       |
       v
AUTHENTICATED
       |
       v
SESSION_EXPIRED
       |
       v
UNAUTHENTICATED
```

### SIP registration states

```text
UNREGISTERED
      |
      v
CONNECTING
      |
      v
REGISTERING
      |
      +------ Failure ------> REGISTRATION_ERROR
      |                             |
      |                             v
      |                       RETRY_WAIT
      |                             |
      +-----------------------------+
      |
      v
REGISTERED
      |
      v
DISCONNECTED
      |
      v
RECONNECTING
```

Use exponential backoff with a maximum delay and random jitter for automatic reconnection. Do not retry indefinitely without notifying the user.

### Call states

```text
IDLE
 |
 +---- Outgoing call ----> INITIATING
 |                            |
 |                            v
 |                         RINGING
 |                            |
 |                            v
 |                         CONNECTING
 |                            |
 |                            v
 |                          ACTIVE
 |                            |
 |                            v
 |                           ENDED
 |
 +---- Incoming call ----> INCOMING
                              |
                     +--------+--------+
                     |                 |
                  ANSWERED           DECLINED
                     |
                     v
                  CONNECTING
                     |
                     v
                   ACTIVE
                     |
              +------+------+
              |             |
            HELD          ACTIVE
              |             |
              +-------------+
                     |
                     v
                    ENDED
```

The exact signalling events and intermediate states depend on the SIP.js session and PBX behaviour. The implementation must account for cancellation, rejection, busy responses, timeouts, and transport failures.

---

# 9. Vercel Serverless API specification

## 9.1 API conventions

**Base URL**

```text
https://phone.re-el.co.za/api/v1
```

The application should use a single configured API base URL, with separate values for development, staging, and production.

### Request conventions

- JSON request and response bodies.
- HTTPS only in production.
- Explicit HTTP methods.
- Consistent validation and error responses.
- Server-side authentication and authorisation.
- Pagination for list endpoints.
- Rate limiting on sensitive operations.
- Request IDs for troubleshooting.
- Idempotency keys for supported operations that must not be repeated accidentally.

### Standard success response

```json
{
  "success": true,
  "data": {
    "id": "example-id"
  },
  "meta": {
    "requestId": "request-id"
  }
}
```

### Standard error response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "fields": {
      "phoneNumber": "Enter a valid telephone number."
    }
  },
  "meta": {
    "requestId": "request-id"
  }
}
```

Do not return stack traces, SQL errors, provider credentials, or sensitive internal configuration to the browser.

## 9.2 Endpoint specification

The following endpoint groups fit the proposed 12-function design.

### Function 1: Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Authenticate a user |
| POST | `/api/v1/auth/logout` | Terminate the session |
| GET | `/api/v1/auth/session` | Retrieve the current user and permissions |
| POST | `/api/v1/auth/password/forgot` | Initiate password recovery |
| POST | `/api/v1/auth/password/reset` | Complete password recovery |

### Function 2: Users

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/users` | List authorised users |
| GET | `/api/v1/users/:id` | Retrieve a user |
| POST | `/api/v1/users` | Create a user |
| PATCH | `/api/v1/users/:id` | Update permitted user fields |
| DELETE | `/api/v1/users/:id` | Deactivate or remove a user according to policy |

### Function 3: Organisations

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/organisations` | List organisations visible to the caller |
| GET | `/api/v1/organisations/:id` | Retrieve an organisation |
| POST | `/api/v1/organisations` | Create an organisation when authorised |
| PATCH | `/api/v1/organisations/:id` | Update organisation settings |
| GET | `/api/v1/organisations/:id/members` | List organisation members |

### Function 4: Extensions

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/extensions` | List authorised extensions |
| POST | `/api/v1/extensions` | Request extension creation |
| PATCH | `/api/v1/extensions/:id` | Update extension metadata |
| POST | `/api/v1/extensions/:id/disable` | Disable an extension |
| POST | `/api/v1/extensions/:id/enable` | Enable an extension |

Extension creation must not merely create a database record and assume the PBX is configured. Track provisioning status and handle partial failures.

### Function 5: Contacts

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/contacts` | List and search contacts |
| GET | `/api/v1/contacts/:id` | Retrieve contact details |
| POST | `/api/v1/contacts` | Create a contact |
| PATCH | `/api/v1/contacts/:id` | Update a contact |
| DELETE | `/api/v1/contacts/:id` | Delete a contact |

### Function 6: Calls and history

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/calls` | Retrieve paginated call history |
| GET | `/api/v1/calls/:id` | Retrieve a call record |
| GET | `/api/v1/calls/active` | Retrieve authorised active-call metadata |
| GET | `/api/v1/calls/:id/usage` | Retrieve available usage information |

The `active` endpoint should report authoritative or appropriately synchronised information. It must not assume that Vercel has a persistent connection to every active SIP session.

### Function 7: Call control

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/call-control/transfer` | Request an authorised transfer |
| POST | `/api/v1/call-control/hold` | Request hold when supported by the selected call architecture |
| POST | `/api/v1/call-control/resume` | Request resumption |
| POST | `/api/v1/call-control/hangup` | Request termination of an authorised call |

**Implementation rule:** Browser-originated operations such as answering, muting, and ending a SIP.js call should normally use the active SIP session directly. The API endpoints are for server-authorised operations and integrations that actually require backend or PBX involvement.

A mute operation generally controls the local media track and does not require a PBX API request.

### Function 8: Settings

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/settings` | Retrieve user preferences |
| PATCH | `/api/v1/settings` | Update permitted preferences |
| GET | `/api/v1/settings/telephony` | Retrieve safe telephony configuration |
| PATCH | `/api/v1/settings/telephony` | Update authorised calling preferences |

The telephony configuration endpoint must never return SIP passwords or other secrets.

### Function 9: Administration

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/admin/dashboard` | Administrative overview |
| GET | `/api/v1/admin/audit-logs` | Search authorised audit records |
| GET | `/api/v1/admin/usage` | Retrieve usage summaries |
| POST | `/api/v1/admin/users/:id/suspend` | Suspend a user |
| POST | `/api/v1/admin/extensions/:id/revoke` | Revoke an extension |

Every administrative action must be authorised and audited.

### Function 10: Webhooks

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/webhooks/telephony` | Receive supported telephony events |
| POST | `/api/v1/webhooks/billing` | Receive billing-provider events |

The function must authenticate the event source using the relevant provider's documented signature or authentication mechanism.

For events from a self-hosted PBX, use a dedicated authenticated integration rather than accepting arbitrary requests from the public internet.

Implement replay protection, duplicate-event handling, and idempotent processing.

### Function 11: Billing

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/billing/plan` | Retrieve plan information |
| GET | `/api/v1/billing/usage` | Retrieve billable usage summaries |
| POST | `/api/v1/billing/checkout` | Initiate a supported checkout |
| POST | `/api/v1/billing/portal` | Create a customer billing-portal session |

Billing functionality can remain disabled until the calling platform has reliable usage tracking and an agreed commercial model.

Never trust a usage amount or subscription status supplied directly by the browser.

### Function 12: Health

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Return basic API health |
| GET | `/api/v1/health/dependencies` | Check configured dependencies where safe |

Public health endpoints should reveal only minimal information. Detailed diagnostics must require appropriate administrative access.

## 9.3 HTTP status codes

Use consistent HTTP semantics.

| Status | Meaning |
|---|---|
| `200` | Successful request |
| `201` | Resource created |
| `202` | Request accepted for asynchronous processing |
| `204` | Successful operation with no response body |
| `400` | Invalid request |
| `401` | Authentication required |
| `403` | Authenticated but not authorised |
| `404` | Resource unavailable or not visible to the caller |
| `409` | Conflict or incompatible state |
| `422` | Valid JSON with invalid field values |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `502` | Upstream dependency failure |
| `503` | Service temporarily unavailable |

Use `202 Accepted` for operations such as extension provisioning when the backend has queued the work but has not completed it.

---

# 10. Database specification

Use PostgreSQL as the primary application database. The schema must support organisation isolation, user permissions, call history, telephony provisioning, and future subscriptions.

## 10.1 Database tables

| Table | Purpose |
|---|---|
| `organisations` | Business accounts |
| `users` | User profiles and account status |
| `organisation_members` | Membership and organisation-specific roles |
| `extensions` | SIP extension metadata |
| `contacts` | Personal and organisation contacts |
| `call_records` | Normalised call history |
| `call_events` | Processed call lifecycle events |
| `user_settings` | User preferences |
| `subscriptions` | Subscription plans and status |
| `usage_records` | Usage and billing calculations |
| `audit_logs` | Security and administrative events |
| `webhook_events` | Event deduplication and processing status |
| `password_reset_tokens` | Secure password recovery |
| `sessions` | Session management, if using database-backed sessions |

Provider credentials and SIP secrets should be stored separately using appropriate secret-management facilities. They should not be placed in ordinary application tables unless encrypted using a carefully designed, access-controlled scheme.

## 10.2 Important data relationships

```text
organisations
    |
    +---- organisation_members ---- users
    |                                |
    |                                +---- user_settings
    |                                |
    |                                +---- sessions
    |
    +---- extensions
    |
    +---- contacts
    |
    +---- call_records
    |         |
    |         +---- call_events
    |
    +---- subscriptions
    |
    +---- usage_records
    |
    +---- audit_logs
```

A user can belong to more than one organisation if the business model requires it. Their permissions should be evaluated in the context of the organisation currently selected.

## 10.3 Schema requirements

Every applicable table should include:

- A primary key.
- Creation timestamp.
- Update timestamp where appropriate.
- Organisation ID for tenant-owned records.
- Foreign keys.
- Appropriate uniqueness constraints.
- Indexes for common queries.
- Explicit deletion and retention policies.

Use UTC timestamps in the database and convert them to the user's preferred timezone in the interface.

For South African users, the default display timezone can be `Africa/Johannesburg`.

### Call record fields

At minimum:

```text
id
organisation_id
user_id
extension_id
provider_call_id
direction
caller_number
callee_number
started_at
answered_at
ended_at
duration_seconds
billable_seconds
disposition
hangup_cause
source
created_at
updated_at
```

Allow `answered_at` to be null for unanswered calls.

The application must distinguish call duration from billable duration. Billable duration depends on the provider's charging rules and cannot always be calculated accurately from the browser's timer.

Use provider or PBX call identifiers to correlate events, and enforce suitable uniqueness constraints to prevent duplicate call records.

## 10.4 Database performance

Create indexes for:
- Organisation ID.
- User ID.
- Extension ID.
- Call start time.
- Call direction.
- Call disposition.
- Normalised contact telephone numbers.
- Webhook event identifiers.

Use pagination for call history and contacts.

Avoid fetching every call record into the browser.

For high-volume call history, introduce appropriate retention policies, query optimisation, and partitioning if measured workloads justify them.

---

# 11. Telephony architecture

The PBX is responsible for the real-time telephone infrastructure.

## 11.1 Asterisk responsibilities

Asterisk should handle:

- SIP endpoint registration.
- Internal extension routing.
- SIP call signalling.
- RTP audio.
- Supported hold and transfer operations.
- DTMF handling.
- External trunk routing.
- Call detail records.
- Supported voicemail and conferencing features.
- Telephony-side access restrictions.

Vercel should not be used as the SIP registrar, RTP media server, or persistent PBX event-processing service.

## 11.2 SIP.js client

The browser should use SIP.js to manage the SIP user agent and call sessions.

Core responsibilities:

1. Establish the secure WebSocket connection.
2. Register the authorised SIP identity.
3. Initiate outgoing calls.
4. Receive incoming-call events.
5. Answer and decline calls.
6. Track session state.
7. Negotiate WebRTC media.
8. Manage supported hold and transfer operations.
9. Handle registration failures.
10. Recover from network disconnections.

The application must use the SIP.js APIs supported by the selected version. Do not mix examples from incompatible releases.

## 11.3 Audio and network requirements

The production deployment must account for:

- HTTPS and WSS.
- Valid TLS certificates.
- Microphone permissions.
- WebRTC media negotiation.
- RTP connectivity.
- NAT traversal.
- STUN configuration.
- TURN relay infrastructure when necessary.
- Firewall configuration.
- Supported codecs.
- Packet loss, latency, and jitter.

A successful SIP registration does not prove that two-way audio will work.

Test calling across different networks, including networks with restrictive NAT or firewall rules.

### Important infrastructure distinction

SIP signalling and audio media are different traffic flows.

A call may connect successfully while audio fails in one or both directions. The implementation must provide diagnostics for this situation rather than showing every connected SIP session as fully operational.

---

# 12. Asterisk configuration and deployment design

Use a dedicated Ubuntu VPS for the PBX.

Suggested logical DNS structure:

| Hostname | Purpose |
|---|---|
| `phone.re-el.co.za` | Web application |
| `api.re-el.co.za` | Optional dedicated API hostname |
| `pbx.re-el.co.za` | SIP/WebRTC endpoint |
| `turn.re-el.co.za` | Optional TURN relay |

If the API is served under `phone.re-el.co.za/api/v1`, a separate API hostname is not required.

## 12.1 Asterisk components

The PBX configuration will typically involve:

- PJSIP endpoint and authentication configuration.
- Asterisk HTTP and secure WebSocket configuration.
- WebRTC endpoint settings.
- RTP configuration.
- Dialplan configuration.
- Optional ARI configuration.
- Optional SIP trunk configuration.
- Call detail record configuration.

The repository should contain example configuration templates and deployment documentation.

Production secrets, private keys, and real SIP passwords must be injected through the server's protected configuration mechanisms.

## 12.2 Extension provisioning

When an administrator creates an extension:

1. Validate the administrator's permissions.
2. Create a provisioning request.
3. Persist the extension's intended configuration.
4. Provision the PBX endpoint through a controlled integration.
5. Verify the PBX configuration or registration readiness.
6. Update the extension status.
7. Record the result in the audit log.
8. Notify the administrator if provisioning fails.

Use explicit provisioning states:

```text
PENDING
    |
    v
PROVISIONING
    |
    +----> FAILED
    |
    v
READY
    |
    v
DISABLED
```

A database row alone must not be treated as proof that the PBX endpoint exists or is functional.

For a small initial deployment, extension configuration can be managed through a restricted PBX-side administrative service. As the platform grows, use a more robust provisioning mechanism with retries, reconciliation, and controlled configuration changes.

## 12.3 Persistent PBX event processing

If using ARI, run the persistent event listener on infrastructure designed to support long-lived processes.

The service should:

- Maintain the required ARI connection.
- Subscribe to supported events.
- Correlate call identifiers.
- Validate event data.
- Handle reconnection.
- Retry transient database failures.
- Deduplicate events.
- Record processing failures.
- Deliver validated events to the application database or API.

Do not open ARI directly to the browser.

For a small initial installation, this event service can run on the PBX VPS, provided it is isolated, monitored, and securely configured.

---

# 13. Security and privacy specification

Security is a release requirement, not a future enhancement.

## 13.1 Authentication

Implement:
- Secure password hashing.
- Login rate limiting.
- Session expiration.
- Session revocation.
- Password recovery.
- Account suspension.
- Permission checks.
- Audit logging for sensitive operations.

For a browser application, secure HTTP-only cookies with `Secure` and appropriate `SameSite` attributes are a suitable session approach.

If cookie authentication is used, protect state-changing requests against cross-site request forgery.

Avoid storing long-lived access tokens in `localStorage`.

## 13.2 Authorisation

Use role-based access control with organisation-scoped permissions.

Suggested roles:

| Role | Permissions |
|---|---|
| Platform administrator | Manage the platform and authorised organisations |
| Organisation owner | Manage the organisation and its authorised settings |
| Organisation administrator | Manage organisation users and extensions |
| Supervisor | Access permitted team and call information |
| Standard user | Use assigned calling features and personal settings |
| Read-only auditor | View explicitly authorised records |

Platform administrators and organisation administrators should not automatically have access to every recording or sensitive call detail. Such access must be explicitly granted and audited.

## 13.3 SIP credential security

The browser must not receive privileged PBX credentials.

If browser SIP registration requires a SIP password, use a secure provisioning process with short-lived, appropriately scoped credentials where supported.

At minimum:
- Never embed a shared SIP password in JavaScript.
- Never commit SIP credentials to GitHub.
- Never return passwords through API responses.
- Avoid logging SIP authentication headers.
- Disable compromised extensions promptly.
- Restrict outbound calling permissions.
- Monitor for suspicious registration and call activity.

## 13.4 API security

Implement:
- Input validation.
- Output encoding where relevant.
- Parameterised database queries.
- Organisation-level access checks.
- Request-size limits.
- Rate limiting.
- Secure CORS configuration.
- Webhook signature verification.
- Replay protection.
- Safe error responses.
- Dependency scanning.

CORS is not an authentication mechanism. Every protected endpoint must independently validate the caller's identity and permissions.

## 13.5 Telephone fraud prevention

Before enabling public telephone calling, configure:

- Allowed destinations.
- International calling restrictions.
- Per-extension limits.
- Per-organisation usage limits.
- Concurrent-call limits.
- Unusual-volume alerts.
- Spending thresholds.
- Extension disablement.
- PBX and provider usage monitoring.

Do not enable unrestricted international dialling by default.

## 13.6 Privacy and recordings

Call recording must remain disabled unless explicitly configured.

If recording is introduced, define:
- Applicable consent requirements.
- Recording-access permissions.
- Retention periods.
- Secure storage.
- Deletion policies.
- Audit records.
- Procedures for handling access requests.

The production deployment should also account for applicable South African privacy and electronic communications requirements.

---

# 14. Environment variables and configuration

The application must separate public configuration from server-side secrets.

## 14.1 Root `.env.example`

```dotenv
# Application
NODE_ENV=development
APP_NAME=Re-EL Softphone
APP_URL=http://localhost:3000
API_BASE_URL=http://localhost:3000/api/v1
DEFAULT_TIMEZONE=Africa/Johannesburg

# Database
DATABASE_URL=

# Authentication
SESSION_SECRET=
PASSWORD_RESET_SECRET=

# Telephony management
PBX_API_BASE_URL=
PBX_API_USERNAME=
PBX_API_PASSWORD=

# SIP configuration
SIP_DOMAIN=
SIP_WSS_URL=
SIP_TRANSPORT=WSS

# Webhook verification
TELEPHONY_WEBHOOK_SECRET=
BILLING_WEBHOOK_SECRET=

# Rate limiting
RATE_LIMIT_STORE_URL=

# Billing
BILLING_PROVIDER=
BILLING_SECRET_KEY=

# Observability
LOG_LEVEL=info
```

This is a template, not a file to populate with real production credentials and commit to Git.

### Configuration rules

1. Keep server-side secrets in Vercel environment variables or the relevant infrastructure's secret store.
2. Keep PBX credentials exclusively on the server.
3. Never prefix a secret with a public frontend environment-variable prefix.
4. Validate required environment variables at application startup or request initialisation.
5. Fail safely when required production configuration is missing.
6. Use separate credentials for development, staging, and production.
7. Rotate credentials after suspected exposure.
8. Do not print secret values in error messages.

The browser's SIP configuration may expose the public SIP domain and WSS endpoint. These are not passwords, but they must still be protected by server-side registration controls and PBX security policies.

---

# 15. Vercel deployment specification

## 15.1 Deployment model

Deploy the frontend and API as Vercel projects connected to the same monorepo.

Recommended initial configuration:

| Setting | Web project | API project |
|---|---|---|
| Repository | `re-el-softphone` | `re-el-softphone` |
| Root directory | `apps/web` | `apps/api` |
| Framework | Other / static site, where appropriate | Node.js functions |
| Production domain | `phone.re-el.co.za` | Optional API domain |
| Environment | Public configuration only | Server-side secrets |
| Deployment | Vercel | Vercel |

The precise build configuration depends on the chosen routing setup.

**Monorepo consideration:** If the frontend and API are deployed as separate projects, ensure the root workspace configuration and shared packages are available to both builds. Do not assume that setting a project root automatically makes every repository file available as an importable package.

For the initial static frontend, keeping the web application as a simple static site reduces build complexity.

## 15.2 Vercel API constraints

The API must be designed around serverless execution.

Do not use Vercel functions for:
- Permanent ARI WebSocket listeners.
- A persistent SIP registrar.
- Long-running audio streams.
- Continuous RTP media processing.
- Unbounded background loops.
- In-memory state that must survive between requests.

Serverless instances may be restarted, scaled independently, or run concurrently.

Consequently:
- Store persistent state in PostgreSQL or another suitable external store.
- Do not rely on module-level variables as shared application state.
- Use a compatible connection-pooling strategy for PostgreSQL.
- Apply explicit request timeouts.
- Keep API requests short.
- Use idempotent operations where retries may occur.
- Move long-running tasks to suitable persistent infrastructure or a supported queue-based architecture.

## 15.3 Function limits

Keep the API within the selected 12-function architectural ceiling.

Use shared libraries for authentication, validation, database access, and authorisation rather than creating a separate function for every small operation.

The route design must still follow Vercel's supported function and routing conventions. A single function can dispatch multiple HTTP methods or supported subroutes when implemented appropriately.

---

# 16. Database deployment and migrations

The database schema must be version-controlled.

Every schema change should be represented by a migration file.

Example:

```text
database/
├── migrations/
│   ├── 001_create_organisations.sql
│   ├── 002_create_users.sql
│   ├── 003_create_memberships.sql
│   ├── 004_create_extensions.sql
│   ├── 005_create_contacts.sql
│   ├── 006_create_call_records.sql
│   ├── 007_create_call_events.sql
│   ├── 008_create_sessions.sql
│   └── 009_create_audit_logs.sql
├── seeds/
│   └── development.sql
└── schema.sql
```

This sequence is illustrative. Additional migrations will be required for the final schema, constraints, indexes, and optional modules.

### Migration rules

- Never use development seed scripts against production accidentally.
- Back up production data before risky schema changes.
- Prefer backward-compatible migrations.
- Separate schema changes from bulk data transformations.
- Test migrations against a disposable database.
- Document rollback or recovery procedures.
- Do not run destructive migrations automatically on every application request.

Use database transactions where supported and appropriate.

---

# 17. Testing strategy

Testing must cover the web interface, application API, database access controls, and real telephony behaviour.

## 17.1 Unit tests

Test:
- Telephone number formatting.
- Input validation.
- Permission evaluation.
- Call-state transitions.
- API response formatting.
- Error handling.
- Date and duration formatting.
- Subscription and usage calculations.
- Theme persistence.

## 17.2 API integration tests

Test:
- Successful login.
- Invalid login.
- Session expiration.
- User creation.
- Extension creation and failure.
- Contact CRUD operations.
- Call-history pagination.
- Permission enforcement.
- Database failures.
- Webhook signature verification.
- Duplicate webhook handling.
- Rate-limit behaviour.

## 17.3 Multi-tenant security tests

Create at least two test organisations.

Verify that:
- Organisation A cannot retrieve Organisation B's contacts.
- Organisation A cannot retrieve Organisation B's call records.
- Users cannot access extensions they are not authorised to manage.
- Standard users cannot invoke administrative operations.
- Changing a resource ID in a request does not bypass permissions.
- Suspended users cannot continue using revoked sessions.
- Cross-organisation access is rejected even when valid IDs are supplied.

These tests should run automatically in CI.

## 17.4 Telephony integration tests

Test with at least two registered browser clients.

| Test | Expected result |
|---|---|
| SIP registration | Client registers successfully |
| Internal outgoing call | Destination rings |
| Incoming call | Recipient sees caller information |
| Answer | Both parties establish audio |
| Decline | Call ends with the correct outcome |
| Hang up | Both clients reflect the ended call |
| Mute | Remote party cannot hear the muted microphone |
| Hold | Call is placed on hold according to the configured PBX behaviour |
| Resume | Audio resumes |
| DTMF | Supported tones reach the destination |
| Network loss | Client reports connection failure and recovers appropriately |
| Expired credentials | Registration fails safely |
| Invalid extension | Call is rejected or fails with a meaningful error |
| Call history | The resulting record is persisted |
| Concurrent calls | Behaviour follows configured limits |

Test real two-way audio, not just successful SIP signalling.

## 17.5 Browser compatibility

Test current supported versions of:
- Google Chrome.
- Mozilla Firefox.
- Microsoft Edge.
- Safari, where supported.

Mobile testing should include Android and iOS browsers.

Verify microphone permissions, audio output selection where supported, incoming-call behaviour, and network recovery on each target browser.

## 17.6 End-to-end tests

Use Playwright or an equivalent browser automation framework for:
- Login and logout.
- Navigation.
- Contact creation.
- Dialer input.
- Responsive layouts.
- Theme selection.
- API error handling.
- Session expiry.
- Administrative permissions.

Automated browser tests should use a test environment and must not initiate paid telephone calls accidentally.

---

# 18. Continuous integration and code quality

The repository should use GitHub Actions to run checks on every pull request.

Recommended pipeline:

```text
Developer opens pull request
           |
           v
       Install dependencies
           |
           v
       Validate formatting
           |
           v
          Lint
           |
           v
        Unit tests
           |
           v
      API integration tests
           |
           v
     Tenant security tests
           |
           v
     Dependency audit
           |
           v
      Build validation
           |
           v
      Merge approval
           |
           v
      Vercel deployment
```

Recommended quality requirements:
- No committed secrets.
- No failing required tests.
- No unresolved critical security findings.
- Database migrations reviewed.
- API permission checks tested.
- Production deployment protected by appropriate access controls.
- Rollback and incident-response procedures documented.

Use automated dependency updates and periodically review vulnerable packages.

---

# 19. Performance and reliability requirements

The system must remain responsive without compromising call quality or data consistency.

| Area | Requirement |
|---|---|
| Initial page load | Target under 2.5 seconds on a representative broadband connection |
| Navigation | Target under 200 ms for local interface transitions |
| API latency | Target p95 under 500 ms for ordinary database-backed operations, excluding external dependencies |
| Call establishment | Measure and optimise call setup time; establish a baseline in the test environment |
| Audio | Two-way audio must work under supported network conditions |
| Call history | Paginated queries with appropriate database indexes |
| API availability | Define a production availability target after infrastructure selection |
| Error handling | Recover gracefully from transient API and network failures |
| Data integrity | Prevent duplicate processing of call events |
| Accessibility | Target WCAG 2.2 AA |
| Responsive design | Support the defined desktop, tablet, and mobile layouts |

These are engineering targets, not guarantees. Validate them through testing and monitoring.

## 19.1 Observability

Track the following metrics:

**Application**
- API request volume.
- API latency.
- Error rates.
- Authentication failures.
- Database connection failures.
- Rate-limit events.

**Telephony**
- SIP registration success rate.
- Call setup duration.
- Failed-call rate.
- Dropped-call rate.
- Audio connectivity failures where measurable.
- Concurrent calls.
- PBX resource utilisation.

**Business**
- Active users.
- Extensions in use.
- Call volume.
- Call duration.
- Billable usage where available.

Use structured logs and correlation IDs to connect application events with PBX records without exposing sensitive information.

---

# 20. Deployment and infrastructure operations

## 20.1 Development environment

The development environment should run on Ubuntu and support:

- Node.js.
- npm workspaces.
- A local frontend development server.
- Vercel-compatible API development.
- A test PostgreSQL database.
- A development Asterisk installation or accessible test PBX.
- Browser testing.

Use separate test SIP extensions and disable paid outbound calling by default.

## 20.2 Staging environment

Staging should reproduce the production architecture as closely as practical.

Use:
- Separate database credentials.
- Separate test organisations.
- Test SIP extensions.
- Non-production webhook secrets.
- A restricted PBX configuration.
- Automated smoke tests.

Do not copy production SIP credentials into staging.

## 20.3 Production environment

Production should include:
- Vercel frontend deployment.
- Vercel API deployment.
- Managed or secured PostgreSQL.
- Ubuntu VPS running Asterisk.
- DNS and valid TLS certificates.
- Restricted network access.
- Monitoring and alerting.
- Automated backups.
- Documented recovery procedures.

### Backup policy

Back up:
- PostgreSQL data.
- Database migration history.
- Non-secret application configuration.
- PBX configuration.
- Necessary operational documentation.

Store backups securely and test restoration periodically.

Do not rely on a backup existing as proof that recovery will work.

### Incident handling

Document procedures for:
- Compromised SIP credentials.
- Suspicious call activity.
- PBX outages.
- Database outages.
- Expired TLS certificates.
- Provider failures.
- Failed deployments.
- Accidental data deletion.

A compromised extension should be revocable without waiting for a full application redeployment.

---

# 21. Future commercial features

The initial architecture should leave room for Re-EL Softphone to become a multi-tenant business communications service.

## 21.1 Organisation administration

Future organisation administrators should be able to:

- Invite team members.
- Assign extensions.
- Disable users.
- Configure permitted call destinations.
- View team call history according to permissions.
- Set usage limits.
- Configure business hours.
- Configure voicemail.
- Manage permitted incoming-call routes.

## 21.2 Subscription management

Potential plans could be organised by:
- Number of users.
- Number of extensions.
- Concurrent calls.
- Monthly usage allowance.
- Advanced call-management features.
- Administrative and reporting features.

Keep subscription entitlements separate from the telephony engine. The application should determine which features an organisation is allowed to use, while the PBX enforces the corresponding call-routing and usage restrictions.

## 21.3 Re-EL ecosystem integration

Potential integrations include:

| Re-EL product | Integration opportunity |
|---|---|
| Re-EL Mailer | Notifications and business contact information |
| Clock-Kit | Contact and organisation directory integration |
| Chatre | AI-assisted call summaries or permitted business workflows |
| Re-EL WebStudio | Business website contact and click-to-call features |
| Re-EL business platform | Shared organisation and customer records |

AI features should be introduced only after the core calling system is reliable.

If call transcription or summarisation is introduced, implement consent, data-retention controls, access permissions, and safeguards against sending sensitive recordings to unauthorised services.

---

# 22. Implementation roadmap

Build the platform in stages, with a working deliverable at the end of each phase.

| Phase | Scope | Definition of done |
|---|---|---|
| 1. Foundation | Monorepo, design tokens, navigation, responsive shell | Application runs locally and deploys to Vercel |
| 2. Authentication | Login, sessions, permissions, organisation model | Protected routes and APIs enforce access control |
| 3. Database | PostgreSQL schema, migrations, seed data | Core records persist correctly |
| 4. Dialer | Keypad, number input, contact lookup, call interface | UI is functional with simulated calls |
| 5. SIP integration | SIP.js and Asterisk configuration | Two browser clients register |
| 6. Internal calling | Outgoing, incoming, answer, decline, hang-up | Two-way audio works between clients |
| 7. Business features | Contacts, history, settings, administration | User data and call records persist |
| 8. Call controls | Mute, hold, DTMF, supported transfers | Controls work correctly in integration tests |
| 9. External calling | SIP trunk and outbound restrictions | Permitted external calls work |
| 10. Reliability | Monitoring, retries, backups, recovery | Operational failure scenarios are tested |
| 11. Commercialisation | Billing, usage limits, organisation onboarding | Tenant isolation and usage enforcement pass testing |
| 12. Release | Security review, browser testing, documentation | Production acceptance criteria pass |

**Recommended first milestone:** Complete Phases 1–6 before investing heavily in billing, AI, call recording, or advanced administration.

This establishes the application's core value: authenticated users can make real calls through a reliable browser interface.

---

# 23. Definition of done for the first production-capable release

The first release is complete only when the following requirements are satisfied.

### Application
- [ ] Re-EL branding and sky-blue design system implemented.
- [ ] Responsive desktop, tablet, and mobile layouts.
- [ ] Login and secure session management.
- [ ] Dialer and keyboard input.
- [ ] Contacts and call history.
- [ ] SIP registration status.
- [ ] Incoming and outgoing call interfaces.
- [ ] Mute, answer, decline, and hang-up.
- [ ] Appropriate errors and loading states.
- [ ] Light and dark themes.

### API and database
- [ ] Vercel Serverless API deployed.
- [ ] PostgreSQL schema and migrations version-controlled.
- [ ] Server-side authentication and authorisation.
- [ ] Organisation-level data isolation.
- [ ] Paginated call history.
- [ ] Validated telephony event ingestion.
- [ ] Duplicate-event handling.
- [ ] Rate limiting and audit logging.
- [ ] Secrets configured outside source control.

### Telephony
- [ ] Asterisk securely configured.
- [ ] SIP over WSS operational.
- [ ] Two browser clients can register.
- [ ] Internal calls work with two-way audio.
- [ ] Call termination works correctly.
- [ ] Network failures are handled.
- [ ] PBX credentials are not exposed to browsers.
- [ ] External calling is restricted until the SIP trunk is configured.

### Operations
- [ ] Production and staging environments separated.
- [ ] DNS and TLS configured.
- [ ] Database backups configured and restoration tested.
- [ ] Monitoring and error logging operational.
- [ ] Deployment and recovery documentation available.
- [ ] Security and tenant-isolation tests pass.

---

# 24. Final technical decisions

The following choices provide a consistent baseline for implementation.

| Decision | Selected approach |
|---|---|
| Product name | Re-EL Softphone |
| Branding | Re-EL Branding & Technologies |
| Primary colour | Sky blue `#38BDF8` |
| Frontend | HTML, CSS, JavaScript |
| Frontend architecture | Feature-based JavaScript modules |
| Repository | Monorepo |
| Workspace manager | npm workspaces |
| Application API | Vercel Serverless Functions |
| API architecture | REST, JSON |
| Database | PostgreSQL |
| Database access | Server-side queries through a suitable PostgreSQL client |
| SIP client | SIP.js |
| Audio | WebRTC |
| PBX | Asterisk |
| PBX hosting | Ubuntu VPS |
| External calls | Compatible SIP trunk |
| Authentication | Secure server-side sessions |
| Tenant model | Multi-tenant with organisation-scoped authorisation |
| UI icons | Lucide |
| Testing | Unit, integration, security, and browser end-to-end tests |
| CI | GitHub Actions |
| Deployment | Vercel + PostgreSQL provider + PBX VPS |

## 25. Recommended implementation order

Start with the monorepo, sky-blue design system, responsive interface, PostgreSQL schema, and Vercel API. Build the dialer using simulated calls so the interface can be completed and tested independently.

Then configure Asterisk and integrate SIP.js. Establish internal calls between two browser clients and verify that audio works in both directions. Once that is reliable, connect the call lifecycle to the database and introduce external telephone calling.

Keep the architecture modular from the beginning, but avoid implementing features that depend on infrastructure you have not yet validated.

The result should be a **Re-EL-owned browser softphone platform with a serverless business API and a dedicated real-time telephony layer**, designed to expand from internal calling into a multi-tenant business phone service.
