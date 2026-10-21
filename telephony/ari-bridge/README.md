# ARI bridge (CloudTel -> webhook)

`ari-bridge` connects Asterisk's ARI WebSocket to the CloudTel telephony webhook
(`POST /api/v1/webhooks/telephony`). It normalises Stasis/Asterisk events into the
shared `TELEPHONY_EVENTS` contract, signs every payload with HMAC-SHA256, and
delivers it with bounded exponential backoff.

## How it works

```
Asterisk (ARI WS) --> index.js --> translate.js --> deliver.js --> CloudTel /webhooks/telephony
                                     (pure)          (signed)
```

- `translate.js` is a pure function: ARI event in, webhook payload out (`null` for
  events with no CloudTel meaning). It is fully unit-tested without a live PBX.
- `deliver.js` signs with the exact scheme the server verifies (`X-Webhook-Timestamp`,
  `X-Webhook-Signature: v1=...`) and retries 5xx/429 responses only.
- `index.js` wires both to an `ari-client` connection and handles graceful shutdown.

## Configuration

Copy `.env.example` and fill in the values. Required:

| Variable | Purpose |
| --- | --- |
| `ARI_URL` | Asterisk ARI base URL, e.g. `http://asterisk.internal:8088` |
| `ARI_USERNAME` / `ARI_PASSWORD` | ARI credentials |
| `ARI_STASIS_APP` | Stasis application name (default `cloudtel`) |
| `CLOUDTEL_WEBHOOK_URL` | e.g. `https://api.cloudtel.example/api/v1/webhooks/telephony` |
| `TELEPHONY_WEBHOOK_SECRET` | Shared HMAC secret (matches the API env) |
| `CLOUDTEL_ORGANISATION_ID` | Optional default tenant for single-tenant PBXs |

## Run

```bash
npm install
node src/index.js        # or: npm start
node --test test/        # unit tests (no Asterisk required)
```

See `../asterisk/` for the matching `ari.conf`, `http.conf`, `pjsip.conf`,
`extensions.conf`, and `stasis` dialplan examples.
