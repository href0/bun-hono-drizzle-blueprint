# Enterprise Structured Logging — Implementation Guide

Read this file when: writing logs in services, configuring log redaction, or tracing requests with correlation IDs.

---

## 1. Centralized Pino Logger (`src/core/logger/logger.ts`)

Logging uses [Pino](https://github.com/pinojs/pino) configured with automatic PII redaction and environment-sensitive formatting:

```typescript
import pino from 'pino';
import { appConfig } from '../../config';

// Simplified: the real file builds these options in a pure `buildLoggerOptions(appConfig)`.
export const logger = pino({
  level: appConfig.LOG_LEVEL,
  base: {
    app: appConfig.APP_NAME,
    env: appConfig.NODE_ENV,
  },
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'authorization',
      'req.headers.authorization',
      'apiKey',
      'secret',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
          },
        }
      : undefined,
});
```

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
