import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { rateLimiter } from 'hono-rate-limiter';
import packageJson from '../package.json';
import { appConfig, httpConfig } from './config';
import {
  asyncHandler,
  globalErrorHandler,
  loggerMiddleware,
  notFoundHandler,
  requestContextMiddleware,
} from './core/middlewares';
import { ApiResponse } from './core/response';
import { healthRoutes } from './modules/health/health.routes';
import { userRoutes } from './modules/users/users.routes';

/**
 * Parses CORS_ORIGIN env var into Hono-compatible origin config.
 * Supports: '*' (wildcard), single origin, or comma-separated multiple origins.
 */
const parseCorsOrigin = (raw: string): string | string[] => {
  if (raw === '*') return '*';
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
};

export const createApp = (): Hono => {
  const app = new Hono();

  // 1. Core security & tracking middlewares
  app.use('*', requestContextMiddleware());
  app.use('*', loggerMiddleware());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: parseCorsOrigin(httpConfig.CORS_ORIGIN),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposeHeaders: ['X-Request-ID'],
    }),
  );

  // 2. Rate limiting (configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX env vars)
  app.use(
    '*',
    rateLimiter({
      windowMs: httpConfig.RATE_LIMIT_WINDOW_MS,
      limit: httpConfig.RATE_LIMIT_MAX,
      standardHeaders: 'draft-6',
      keyGenerator: (c) =>
        c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'anonymous',
    }),
  );

  // 3. Global error & 404 handlers
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);

  // 4. Mount module routes under api prefix
  app.route(`${appConfig.API_PREFIX}/health`, healthRoutes);
  app.route(`${appConfig.API_PREFIX}/users`, userRoutes);

  // Root endpoint
  app.get(
    '/',
    asyncHandler(() =>
      Promise.resolve(
        new ApiResponse(
          {
            name: appConfig.APP_NAME,
            environment: appConfig.NODE_ENV,
            version: packageJson.version,
          },
          'Service online',
          200,
        ),
      ),
    ),
  );

  return app;
};
