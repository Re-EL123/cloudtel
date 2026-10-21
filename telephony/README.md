# Telephony

This directory contains everything needed to connect the CloudTel browser
softphone to a real PBX.

```
telephony/
  asterisk/       Asterisk configuration examples (ARI, PJSIP, HTTP, dialplan)
  ari-bridge/     Node service: Asterisk ARI -> CloudTel telephony webhooks
```

## Data flow

```
Browser (SIP.js over WSS)
        │  register / invite / dtmf
        ▼
Asterisk  ──ARI WS──►  ari-bridge  ──signed webhook──►  POST /api/v1/webhooks/telephony
        ▲                                                   │
        └────────────  CloudTel REST (call-control)  ◄───────┘
```

- **Signalling**: the browser registers with Asterisk over secure WebSocket
  (WSS) using TLS + DTLS-SRTP media. See `apps/web/assets/js/telephony/sip-client.js`.
- **Events**: `ari-bridge` observes the Stasis application and forwards call
  lifecycle events to CloudTel, which owns the call record, usage, and billing
  source of truth.
- **Control**: answer / hangup / hold / mute / transfer / DTMF flow through
  CloudTel's `call-control` function, which calls the PBX back via ARI.

## Quick start

1. Apply the Asterisk examples under `asterisk/`.
2. Configure `ari-bridge/.env` from `ari-bridge/.env.example`.
3. `cd ari-bridge && npm install && npm start`.

See `ari-bridge/README.md` for details and `docs/telephony.md` for the full
integration guide.
