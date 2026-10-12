# Bootstrap & Application Lifecycle — Implementation Guide

Read this file when: modifying `src/app.ts`, `src/index.ts`, configuring middleware execution order, or handling server graceful shutdown.

---

## 1. Application Factory Pattern (`src/app.ts`)

In Hono with Bun, application initialization is isolated in a factory function `createApp()` so that it can be instantiated freshly in tests (`app.request()`) without port conflicts or lifecycle leaks.

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { secureHeaders } from 'hono/secure-headers';
import packageJson from '../package.json';
import { appConfig, httpConfig } from './config';
import {
  asyncHandler,
  authenticate,
  bodySizeLimit,
  corsMiddleware,
  globalErrorHandler,
  loggerMiddleware,
  notFoundHandler,
  isUnderPath,
  rateLimit,
  requestContextMiddleware,
} from './core/middlewares';
import { I18N_MESSAGES } from './core/i18n';
import { describeEndpoint, mountApiDocs } from './core/openapi';
import { isPublicRoute } from './core/security/public-routes';
import { ApiResponse } from './core/response';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { userRoutes } from './modules/users/users.routes';

const serviceInfoSchema = z.object({
  name: z.string(),
  environment: z.enum(['development', 'production', 'test']),
  version: z.string(),
});

/** Pipeline order: plan appendix L10. */
export const createApp = (): Hono => {
  const app = new Hono();
  const basePath = appConfig.API_BASE_PATH;
  const healthPath = `${basePath}/health`;

  // 1–2. Request context (request ID, locale, trusted client IP) and request logging
  app.use('*', requestContextMiddleware());
  app.use('*', loggerMiddleware());

  // 3–4. Security headers; CORS only when CORS_ORIGINS lists origins (empty = no CORS headers)
  app.use('*', secureHeaders());
  if (httpConfig.CORS_ORIGINS.length > 0) {
    app.use('*', corsMiddleware(httpConfig.CORS_ORIGINS));
  }

  // 5. Body size limit → 413 in the standard error envelope
  app.use('*', bodySizeLimit(httpConfig.HTTP_BODY_LIMIT_BYTES));

  // 6. Global rate limit per trusted client IP (Redis, fail-open); probes are exempt
  app.use(
    '*',
    rateLimit({
      windowSeconds: httpConfig.RATE_LIMIT_WINDOW_SECONDS,
      max: httpConfig.RATE_LIMIT_MAX,
      keyPrefix: 'global',
      skip: isUnderPath(healthPath),
    }),
  );

  // 7. Unversioned, public: health probes
  app.route(healthPath, healthRoutes);

  // 8. Partner gateway: signed requests (HMAC, spec v1) instead of access tokens
  const v1Path = `${basePath}/v1`;
  const partnerPath = `${v1Path}/partner`;
  app.use(
    `${partnerPath}/*`,
    partnerAuth({
      basePath: partnerPath,
      lookup: (apiKeyHash) => partnerCredentialsService.findForGateway(apiKeyHash),
    }),
  );

  // 9. Default-deny: every versioned route needs an access token, except PUBLIC_ROUTES and
  //    partner routes that partnerAuth() verified
  app.use(`${v1Path}/*`, authenticate({ basePath: v1Path }));

  // 10. Versioned API — the version is code, not configuration (a new version = a new router)
  const v1 = new Hono();
  v1.route('/auth', authRoutes);
  v1.route('/users', userRoutes);
  app.route(v1Path, v1);

  app.get(
    '/',
    describeEndpoint({
      tags: ['Service'],
      summary: 'Service identity: name, environment and version',
      response: { status: 200, description: 'Service is online', data: serviceInfoSchema },
    }),
    asyncHandler(() =>
      Promise.resolve(
        new ApiResponse(
          {
            name: appConfig.APP_NAME,
            environment: appConfig.NODE_ENV,
            version: packageJson.version,
          },
          I18N_MESSAGES.SERVICE_ONLINE,
          200,
        ),
      ),
    ),
  );

  // OpenAPI JSON + reference UI (<base>/docs) — last, so the document sees every route
  mountApiDocs(app, {
    basePath,
    enabled: appConfig.API_DOCS_ENABLED,
    // Same rule as authenticate(): documents bearerAuth + 401 on every protected operation
    requiresAuthentication: (method, path) =>
      path.startsWith(`${v1Path}/`) &&
      !isPublicRoute(method, path.slice(v1Path.length).replace(/\{(\w+)\}/g, ':$1')),
    info: {
      title: appConfig.APP_NAME,
      version: packageJson.version,
      description: packageJson.description,
    },
  });

  // 11. Error and 404 handlers
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);

  return app;
};
```

---

## 2. Server Entry & Pre-Flight Verification (`src/index.ts`)

PostgreSQL is fail-fast (the process exits); Redis is fail-open (the server starts degraded while the client keeps reconnecting in the background, see [redis-cache.md](redis-cache.md) §4).

```typescript
import type { Server } from 'bun';
import { createApp } from './app';
import { appConfig, redisConfig } from './config';
import { logger } from './core/logger';
import { sqlClient } from './database/connection';
import { closeRedisClient, redisClient } from './core/cache/redis.client';

export async function bootstrap(): Promise<Server<unknown>> {
  logger.info({ env: appConfig.NODE_ENV }, 'Starting bootstrap pre-flight verification...');

  // 1. Verify PostgreSQL Database Connection
  try {
    logger.info('Verifying PostgreSQL database connection...');
    await sqlClient`SELECT 1;`;
    logger.info('PostgreSQL database connection established successfully');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.fatal(
      { err: errorMsg },
      'FATAL: PostgreSQL database connection failed during startup. Server startup aborted.',
    );
    process.exit(1);
  }

  // 2. Verify Redis Connection (Fail-Open Resilience)
  try {
    logger.info('Verifying Redis connection...');
    if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
      await redisClient.connect();
    }
    await redisClient.ping();
    logger.info('Redis connection established successfully');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: errorMsg, host: redisConfig.REDIS_HOST, port: redisConfig.REDIS_PORT },
      'WARNING: Redis connection unavailable on startup. Operating in degraded fail-open mode.',
    );
  }

  // 3. Start Hono HTTP Server
  const app = createApp();

  const server = Bun.serve({
    port: appConfig.PORT,
    fetch: app.fetch,
  });

  logger.info(
    {
      port: appConfig.PORT,
      env: appConfig.NODE_ENV,
      basePath: appConfig.API_BASE_PATH,
      health: `${server.url.origin}${appConfig.API_BASE_PATH}/health`,
      docs: appConfig.API_DOCS_ENABLED
        ? `${server.url.origin}${appConfig.API_BASE_PATH}/docs`
        : 'disabled',
    },
    `${appConfig.APP_NAME} server started successfully on port ${appConfig.PORT}`,
  );

  // 4. Graceful Shutdown Hooks
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Termination signal received. Shutting down server gracefully...');
    await server.stop(true);

    try {
      await Promise.all([sqlClient.end({ timeout: 5 }), closeRedisClient(redisClient)]);
      logger.info('Database pool and Redis connections closed cleanly');
    } catch (shutdownErr: unknown) {
      logger.error({ err: shutdownErr }, 'Error during resource teardown');
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });

  return server;
}

if (import.meta.main) {
  void bootstrap();
}
```

---

## 3. Mandatory Middleware Pipeline Order

| Order | Middleware | Purpose |
|---|---|---|
| 1 | `requestContextMiddleware()` | Request ID (safe inbound `X-Request-ID` or UUID v7), locale (`Accept-Language`), trusted client IP (`TRUST_PROXY_HOPS`); runs the rest of the request — including error and not-found handlers — inside the `RequestContext` |
| 2 | `loggerMiddleware()` | Logs method/path/client IP in and status/duration out (`requestId`/`actor` come from the logger mixin) |
| 3 | `secureHeaders()` | `X-Content-Type-Options`, `X-Frame-Options`, HSTS, … |
| 4 | `corsMiddleware(CORS_ORIGINS)` | Mounted only when `CORS_ORIGINS` is non-empty; allowlist with credentials; unlisted origins get no `Access-Control-Allow-Origin` |
| 5 | `bodySizeLimit(HTTP_BODY_LIMIT_BYTES)` | 413 `ERR_PAYLOAD_TOO_LARGE` by `Content-Length` or while streaming |
| 6 | `rateLimit({ keyPrefix: 'global' })` | Fixed window per trusted client IP via Redis `increment`; `RateLimit-*` headers; 429 + `Retry-After`; fails open; health probes skipped |
| 7 | Routes | `<API_BASE_PATH>/health` (unversioned, public) |
| 8 | `partnerAuth({ basePath: '<API_BASE_PATH>/v1/partner', lookup })` | Partner gateway: request signed per spec v1 (headers, timestamp window, API key → active credential, IP whitelist, `allowed_routes`, signature over the raw body read once, nonce, per-partner rate limit); actor `partner:<code>`; one audit log line per request. Lookup injected from the `partner-credentials` module |
| 9 | `authenticate({ basePath: '<API_BASE_PATH>/v1' })` | **Default-deny**: every versioned route needs `Authorization: Bearer <access token>` except `PUBLIC_ROUTES` (`src/core/security/public-routes.ts`); sets actor `user:<id>` + role. Unversioned routes (health, docs, `/`) are public by design (asserted by `test/default-deny.e2e.test.ts`). Partner routes (`/v1/partner/*`) pass only once `partnerAuth()` verified the partner (fail-closed) |
| 10 | Routes | The versioned router `<API_BASE_PATH>/v1` holding the domain modules (`v1.route('/users', …)`; `validate()` and `requireRole()` per route, controllers return `ApiResponse`). The version is code, not env: a new version is a new router |
| — | `mountApiDocs()` | `<API_BASE_PATH>/docs` (Scalar UI) + `/docs/openapi.json`, mounted after every route so the document sees them all; not mounted when `API_DOCS_ENABLED` is false (production default) |
| 11 | `app.onError(globalErrorHandler)` · `app.notFound(notFoundHandler)` | Standard error envelope; `ApiError` status, `HTTPException` mapping, internal 500 details never exposed |

CORS runs before the body limit and rate limit so that 413/429 responses still carry CORS headers (browser code can read them). Preflight `OPTIONS` is answered by CORS and never counts against the rate limit.

Client IP: `X-Forwarded-For` is only honoured with `TRUST_PROXY_HOPS = n > 0` (n-th entry from the right — the last one written by our own proxies). With `0` the socket address is used, so a forged header cannot dodge the rate limit.

### Stricter limits per route

Sensitive endpoints (login, refresh, OTP, password reset) add their own `rateLimit()` in the module's routes file. It counts separately from the global limit (own `keyPrefix`) and both apply:

```typescript
import { rateLimit, validate } from '../../core/middlewares';

authRoutes.post(
  '/login',
  rateLimit({ windowSeconds: 15 * 60, max: 10, keyPrefix: 'auth-login' }),
  validate({ body: loginSchema }),
  authController.login,
);
```

Use a distinct, kebab-case `keyPrefix` per limit. Exempt paths with `skip: isUnderPath(prefix)` (segment-boundary match — never `startsWith`). The limit fails open when Redis is down, so it is a throttle, not the only defence (combine with account lockout / audit logs where it matters).