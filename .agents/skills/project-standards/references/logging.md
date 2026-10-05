# Enterprise Structured Logging — Implementation Guide

Read this file when: writing logs in services, configuring log redaction, or tracing requests with correlation IDs.

---

## 1. Centralized Pino Logger (`src/core/logger/logger.ts`)

Logging uses [Pino](https://github.com/pinojs/pino). Source of truth: `src/core/logger/logger.ts` — options are built by the pure `buildLoggerOptions(appConfig, hostTimeZone)` so every environment branch is unit-tested, then `export const logger = pino(buildLoggerOptions(appConfig, hostTimeZone))`.

| Option | Value |
|---|---|
| `level` | `LOG_LEVEL` (default `info`; tests usually run with `LOG_LEVEL=fatal`) |
| `base` | `{ app: APP_NAME, env: NODE_ENV }` on every line |
| `mixin` | `requestContextMixin` → `requestId` and `actor` from the `RequestContext` (§2) |
| `redact` | `password`, `passwordHash`, `token`, `apiKey`, `secret` (each also as `*.<name>`), `authorization`, `req.headers.authorization`, `nik`, `creditCard` → `[REDACTED]` |
| `timestamp` | Development: the host machine's wall clock with its offset, e.g. `[2026-10-05 11:30:22.877 +07:00]` — follows the developer's zone wherever they are (`hostTimeZone`, read before the process switches to UTC). Elsewhere: ISO 8601 UTC, `"time":"2026-10-05T04:30:23.989Z"` — readable raw on a server and parsed natively by log pipelines, which display it in each viewer's zone |
| `transport` | `pino-pretty` (single line) only when `NODE_ENV=development`; JSON lines elsewhere |

Adding a sensitive field: extend `redact.paths` in `buildLoggerOptions()` (top level and `*.<field>`) and add a case to `logger.test.ts`.

---

## 2. Request Correlation & Contextual Logging

`requestContextMiddleware` (`src/core/middlewares/request-context.ts`) runs first and executes the rest of the request inside a `RequestContext` (`src/core/context/request-context.ts`, AsyncLocalStorage):

- `requestId`: the inbound `X-Request-ID` when it matches `^[A-Za-z0-9._:-]{1,128}$` (prevents log injection), otherwise a new UUID v7. Echoed in the `X-Request-ID` response header and in error envelopes (`request_id`).
- `locale`: the response language negotiated from `Accept-Language` (fallback `DEFAULT_LOCALE`); `getLocale()`.
- `clientIp`: the trusted client address — the socket address, or with `TRUST_PROXY_HOPS = n > 0` the n-th `X-Forwarded-For` entry from the right; `unknown` without a socket (tests). `getClientIp()`; logged on the `Incoming request` line and used as the rate-limit key.
- `actor`: `anonymous` until authentication sets it (`setActor('user:<id>')` / `partner:<code>`); `system` outside a request.

The logger's `mixin` adds `requestId` and `actor` to **every** log line written during the request, in any layer. Never pass them manually and never read them from the Hono `Context`:

```typescript
// anywhere in a service, repository or integration — no Context needed
logger.info({ userId }, 'User registration successful');
// → {"requestId":"0192f1d0-…","actor":"user:42","userId":"…","msg":"User registration successful"}
```

Code that needs the values directly (audit columns, outbound propagation) uses `getRequestContext()` / `getActor()`.

---

## 3. Best Practices for Developers

1. **Structured Log Arguments**: Always pass an object as the first parameter, followed by a message:
   ```typescript
   logger.info({ userId: user.id, email: user.email }, 'User registration successful');
   ```
2. **Never Use Emojis in Production Logs**:
   - `logger.info('Processing payment...');` ✓
   - `logger.info('🚀 Processing payment...');` ✗
3. **Log Levels**:
   - `debug`: Detailed diagnostics (cache hit/miss, payload inspection).
   - `info`: Key lifecycle events (service startup, critical business actions).
   - `warn`: Recoverable anomalies (fail-open cache bypass, deprecation notices).
   - `error`: Actionable failures (unhandled exceptions, external vendor timeout).
