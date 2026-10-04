import type { MiddlewareHandler } from 'hono';
import { logger } from '../logger/logger';

/** Logs request start/end; `requestId` and `actor` are added by the logger mixin. */
export const loggerMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = performance.now();
    const { method, path } = c.req;

    logger.info({ method, path }, 'Incoming request');

    await next();

    const duration = Math.round(performance.now() - start);
    const status = c.res.status;

    logger.info({ method, path, status, durationMs: duration }, 'Request completed');
  };
};
