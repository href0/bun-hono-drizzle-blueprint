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
  partnerAuth,
  rateLimit,
  rejectionLimit,
  requestContextMiddleware,
  requireVerifiedWebhook,
  webhookAuth,
  type WebhookVendor,
} from './core/middlewares';
import { I18N_MESSAGES } from './core/i18n';
import { describeEndpoint, mountApiDocs } from './core/openapi';
import { isPartnerRoute, isPublicRoute } from './core/security/public-routes';
import { ApiResponse } from './core/response';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { partnerCredentialRoutes } from './modules/partner-credentials/partner-credentials.routes';
import { partnerCredentialsService } from './modules/partner-credentials/partner-credentials.service';
import { partnerGatewayRoutes } from './modules/partner-gateway/partner-gateway.partner.routes';
import { userRoutes } from './modules/users/users.routes';
// Example module (header + detail): removed by `bun run setup <name>` unless --keep-examples.
import { ordersRouter } from './modules/orders/orders.routes';
// Example vendor webhook (Demo Pay → payment-notifications): removed by `bun run setup <name>` unless --keep-examples.
import { demoPayWebhook } from './integrations/demo-pay/demo-pay.webhook';
import { paymentNotificationWebhookRoutes } from './modules/payment-notifications/payment-notifications.webhook.routes';
// Example modules (parent + dependents 1:N / 1:1): removed by `bun run setup <name>` unless --keep-examples.
import { projectsRouter } from './modules/projects/projects.routes';
import {
  projectTasksParentRouter,
  projectTasksRouter,
} from './modules/projects/project-tasks/project-tasks.routes';
import {
  projectBudgetsParentRouter,
  projectBudgetsRouter,
} from './modules/projects/project-budgets/project-budgets.routes';
// scaffold:imports — `bun run scaffold` adds module and vendor imports above this line; keep it.

/**
 * Vendors whose webhooks this API accepts (plan D23): each gets its verifier on
 * `<API_BASE_PATH>/webhooks/<vendor>/*`. A webhook route of an unlisted vendor answers 401.
 */
export const WEBHOOK_VENDORS: readonly WebhookVendor[] = [demoPayWebhook];

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
  const webhooksPath = `${basePath}/webhooks`;
  const v1Path = `${basePath}/v1`;
  const partnerPath = `${v1Path}/partner`;

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

  // 6. Global rate limit per trusted client IP (Redis, fail-open). Exempt: probes, and the partner
  //    and webhook prefixes — they authenticate the caller themselves (per-partner rate_limit_rpm),
  //    so per IP only their refused attempts are limited
  const limitWindow = {
    windowSeconds: httpConfig.RATE_LIMIT_WINDOW_SECONDS,
    max: httpConfig.RATE_LIMIT_MAX,
  };
  app.use(
    '*',
    rateLimit({
      ...limitWindow,
      keyPrefix: 'global',
      skip: isUnderPath(healthPath, partnerPath, webhooksPath),
    }),
  );
  for (const prefix of [partnerPath, webhooksPath]) {
    app.use(`${prefix}/*`, rejectionLimit({ ...limitWindow, keyPrefix: 'inbound-rejected' }));
  }

  // 7. Unversioned, public: health probes
  app.route(healthPath, healthRoutes);

  // 7b. Vendor webhooks — unversioned (the vendor owns the contract) and fail-closed: each vendor's
  //     verifier, then a guard that refuses anything under the prefix no verifier accepted
  for (const vendor of WEBHOOK_VENDORS) {
    app.use(`${webhooksPath}/${vendor.vendor}/*`, webhookAuth(vendor));
  }
  app.use(`${webhooksPath}/*`, requireVerifiedWebhook());
  app.route(`${webhooksPath}/${demoPayWebhook.vendor}`, paymentNotificationWebhookRoutes);
  // scaffold:webhook-routes — `bun run scaffold` adds webhook receivers above this line; keep it.

  // 8. Partner gateway: signed requests (HMAC, spec v1) instead of access tokens
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
  v1.route('/partner-credentials', partnerCredentialRoutes);
  v1.route('/partner', partnerGatewayRoutes);
  v1.route('/orders', ordersRouter);
  v1.route('/projects', projectsRouter);
  v1.route('/projects/:projectId/tasks', projectTasksParentRouter);
  v1.route('/project-tasks', projectTasksRouter);
  v1.route('/projects/:projectId/budget', projectBudgetsParentRouter);
  v1.route('/project-budgets', projectBudgetsRouter);
  // scaffold:v1-routes — `bun run scaffold` adds versioned routes above this line; keep it.
  app.route(v1Path, v1);

  app.get(
    '/',
    describeEndpoint({
      tags: ['Service'],
      summary: 'Service identity: name, environment and version',
      response: {
        status: 200,
        description: 'Service is online',
        message: I18N_MESSAGES.SERVICE_ONLINE,
        data: serviceInfoSchema,
      },
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
    // Same rules as authenticate(), partnerAuth() and webhookAuth()
    security: {
      requiresAuthentication: (method, path) =>
        path.startsWith(`${v1Path}/`) &&
        !isPublicRoute(method, path.slice(v1Path.length).replace(/\{(\w+)\}/g, ':$1')),
      requiresPartnerSignature: (_method, path) =>
        path.startsWith(`${v1Path}/`) &&
        isPartnerRoute(path.slice(v1Path.length).replace(/\{(\w+)\}/g, ':$1')),
      webhooks: { pathPrefix: webhooksPath, vendors: WEBHOOK_VENDORS },
    },
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
