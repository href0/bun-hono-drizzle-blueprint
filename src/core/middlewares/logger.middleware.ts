import type { MiddlewareHandler } from 'hono';
import { getClientIp } from '../context/request-context';
import { logger } from '../logger/logger';

/** Logs request start/end; `requestId` and `actor` are added by the logger mixin. */
export const loggerMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = performance.now();
    const { method, path } = c.req;

    logger.info({ method, path, ip: getClientIp() }, 'Incoming request');

    await next();

    const duration = Math.round(performance.now() - start);
    const status = c.res.status;

    logger.info({ method, path, status, durationMs: duration }, 'Request completed');
  };
};
