# Bootstrap & Application Lifecycle — Implementation Guide

Read this file when: modifying `src/app.ts`, `src/index.ts`, configuring middleware execution order, or handling server graceful shutdown.

---

## 1. Application Factory Pattern (`src/app.ts`)

In Hono with Bun, application initialization is isolated in a factory function `createApp()` so that it can be instantiated freshly in tests (`app.request()`) without port conflicts or lifecycle leaks.

```typescript
import { Hono } from 'hono';
import {
  requestContextMiddleware,
  loggerMiddleware,
  errorHandler,
  notFoundHandler,
} from './core/middlewares';
import { healthRouter } from './modules/health/health.routes';
import { usersRouter } from './modules/users/users.routes';

export const createApp = (): Hono => {
  const app = new Hono();

  // 1. Correlation ID Middleware (generates or propagates X-Request-ID)
  app.use('*', requestContextMiddleware());

  // 2. Structured Request Logging (Pino with execution duration)
  app.use('*', loggerMiddleware);

  // 3. Healthcheck Probes (Liveness & Readiness)
  app.route('/health', healthRouter);

  // 4. API Domain Routes
  app.route('/api/v1/users', usersRouter);

  // 5. Global 404 Not Found Handler
  app.notFound(notFoundHandler);

  // 6. Global Exception Error Filter
  app.onError(errorHandler);

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
import { redisClient } from './core/cache/redis.client';

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
      apiPrefix: appConfig.API_PREFIX,
    },
    `${appConfig.APP_NAME} server started successfully on port ${appConfig.PORT}`,
  );

  // 4. Graceful Shutdown Hooks
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Termination signal received. Shutting down server gracefully...');
    await server.stop(true);

    try {
      await Promise.all([sqlClient.end({ timeout: 5 }), redisClient.quit()]);
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
| 1 | `requestContextMiddleware` | Resolves the request ID (safe inbound `X-Request-ID` or UUID v7) and runs the rest of the request — including error and not-found handlers — inside the `RequestContext` |
| 2 | `loggerMiddleware` | Records incoming HTTP method/path and outbound response status with duration |
| 3 | Route Handlers | Domain logic with input validation (`validate` middleware) and pure response returns |
| 4 | `notFoundHandler` | Catches unmatched routes and returns standard `NotFoundError` JSON envelope |
| 5 | `errorHandler` | Catches unhandled exceptions, maps `ApiError` status, masks internal 500 stacks, and outputs standard JSON |
