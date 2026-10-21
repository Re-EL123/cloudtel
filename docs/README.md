# CloudTel documentation

Start here.

| Document | Contents |
| --- | --- |
| [architecture.md](./architecture.md) | system design, the 12-function ceiling, boundaries |
| [api-reference.md](./api-reference.md) | every endpoint, auth modes, error codes |
| [database.md](./database.md) | migrations, tables, tenant rules, seeds |
| [security.md](./security.md) | auth, CSRF, RBAC, tenant isolation, webhooks |
| [deployment.md](./deployment.md) | Vercel projects, env vars, deploy steps |
| [telephony.md](./telephony.md) | SIP.js, Asterisk, ARI bridge, event contract |
| [design-system.md](./design-system.md) | tokens, components, accessibility |
| [troubleshooting.md](./troubleshooting.md) | common issues and fixes |
| [disaster-recovery.md](./disaster-recovery.md) | RPO/RTO, restore procedure, drills |

## Conventions

- The product is always **CloudTel** (see `AGENTS.md`).
- Quality gates before finishing any change:

  ```bash
  npm run build
  npm run check:functions
  npm run lint
  npm run test:unit
  ```

  With a database available, also `npm run test:integration` and
  `npm run test:security`.
