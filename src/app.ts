import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import packageJson from '../package.json';
import { appConfig, httpConfig } from './config';
import {
  asyncHandler,
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
import { ApiResponse } from './core/response';
import { healthRoutes } from './modules/health/health.routes';
import { userRoutes } from './modules/users/users.routes';

/** Pipeline order: plan appendix L10. */
export const createApp = (): Hono => {
  const app = new Hono();
  const healthPath = `${appConfig.API_PREFIX}/health`;

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

  // 7–10. Routes
  app.route(healthPath, healthRoutes);
  app.route(`${appConfig.API_PREFIX}/users`, userRoutes);

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
          I18N_MESSAGES.SERVICE_ONLINE,
          200,
        ),
      ),
    ),
  );

  // 11. Error and 404 handlers
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);

  return app;
};
