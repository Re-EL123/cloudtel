# Telephony

How CloudTel connects the browser softphone to a real PBX, and how call events
flow back for history, usage, and billing.

## Data flow

```
Browser (SIP.js over WSS + DTLS-SRTP)
        │  REGISTER / INVITE / DTMF
        ▼
Asterisk ──ARI WebSocket──► telephony/ari-bridge ──signed webhook──► API
        ▲                                                              │
        └────────────── call-control (ARI via PBX client) ◄────────────┘
```

- **Signalling**: `apps/web/assets/js/telephony/sip-client.js` is the only module
  that imports SIP.js. Registration state is independent of UI state.
- **Events**: `ari-bridge` observes the Stasis application, normalises ARI events
  into the `TELEPHONY_EVENTS` contract, signs them, and POSTs to
  `/api/v1/webhooks/telephony`.
- **Control**: answer/hangup/hold/resume/mute/transfer/DTMF are proxied by the
  `call-control` function through the PBX client (`apps/api/lib/pbx-client.js`).

## Event contract

`POST /api/v1/webhooks/telephony` accepts these `type` values (see
`packages/shared/src/constants.js`):

```
call.started  call.ringing  call.answered  call.held  call.resumed
call.ended    call.failed    registration.changed    voicemail.deposited
```

Payload fields used by the server:

| Field | Meaning |
| --- | --- |
| `type` | event type (required) |
| `callId` | provider call id (required for call events) |
| `direction` | `incoming` / `outgoing` |
| `callerNumber` / `calleeNumber` | E.164 or extension numbers |
| `callerName` | display name |
| `extension` | owning extension number (resolves the tenant) |
| `startedAt` / `answeredAt` / `endedAt` | ISO timestamps |
| `hangupCause` | Asterisk cause (drives disposition) |
| `billableSeconds` | billable duration (else duration is used) |
| `declined` / `busy` / `voicemail` / `failed` | disposition hints |
| `organisationId` | explicit tenant (optional) |
| `eventId` | dedupe key |

Disposition is derived by `deriveDisposition()` in `@cloudtel/shared` from
direction, answered, hangup cause, and termination side.

## The ARI bridge

`telephony/ari-bridge` is a small Node service:

```
index.js      connects to ARI, subscribes to Stasis events
translate.js  pure ARI-event → webhook-payload mapping (unit tested)
deliver.js    HMAC signing + bounded exponential backoff
config.js     environment configuration
```

Run it:

```bash
cd telephony/ari-bridge
cp .env.example .env        # fill in ARI + webhook settings
npm install
npm start
```

It reuses the exact signature scheme the API verifies, so no shared code is
needed. See `telephony/ari-bridge/README.md`.

## Asterisk configuration

Example configs live in `telephony/asterisk/`:

| File | Purpose |
| --- | --- |
| `ari.conf` | ARI user matching the bridge credentials |
| `http.conf` | ARI HTTP server (bind internally, TLS via proxy) |
| `pjsip.conf` | WebRTC PJSIP endpoints/aors/auths (one per extension) |
| `extensions.conf` | all calls handed to the Stasis app |
| `realtime.sql` | optional DB-backed PJSIP provisioning |

Key requirements:

- Media **must** be encrypted (`media_encryption = dtls`) because browsers only
  send secure media.
- WebRTC endpoints need `webrtc = yes`, `ice_support = yes`, `dtmf_mode = rfc4733`.
- The Stasis dialplan passes `internal`/`outbound`/`voicemail` as app args so the
  bridge can classify the call direction.

## Provisioning extensions

CloudTel is the source of truth. A provisioning agent polls
`GET /api/v1/extensions`, provisions the matching PJSIP objects, and on
`POST /extensions/:id/rotate` updates the auth password and reloads PJSIP.
Passwords never leave the server toward the browser.

## Troubleshooting

See [troubleshooting.md](./troubleshooting.md#telephony) for registration,
one-way-audio, and webhook-signature failure cases.
