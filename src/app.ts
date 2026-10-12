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
import { partnerCredentialRoutes } from './modules/partner-credentials/partner-credentials.routes';
import { userRoutes } from './modules/users/users.routes';
// Example module (header + detail): removed by `bun run setup <name>` unless --keep-examples.
import { ordersRouter } from './modules/orders/orders.routes';

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

  // 9. Default-deny: every versioned route needs an access token, except PUBLIC_ROUTES
  const v1Path = `${basePath}/v1`;
  app.use(`${v1Path}/*`, authenticate({ basePath: v1Path }));

  // 10. Versioned API — the version is code, not configuration (a new version = a new router)
  const v1 = new Hono();
  v1.route('/auth', authRoutes);
  v1.route('/users', userRoutes);
  v1.route('/partner-credentials', partnerCredentialRoutes);
  v1.route('/orders', ordersRouter);
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
