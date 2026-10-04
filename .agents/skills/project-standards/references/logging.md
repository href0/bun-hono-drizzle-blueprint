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

Every HTTP request receives a unique `requestId` via `requestIdMiddleware` (`src/core/middlewares/request-id.ts`), stored in Hono context `c.get('requestId')`.

When logging inside middleware or controller:

```typescript
// logger.middleware.ts
logger.info(
  {
    method: c.req.method,
    path: c.req.path,
    requestId: c.get('requestId'),
  },
  'Incoming request',
);
```

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
