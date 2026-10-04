import type { MiddlewareHandler } from 'hono';
import { logger } from '../logger/logger';

export const loggerMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = performance.now();
    const { method, path } = c.req;
    const requestId: string =
      (c.get('requestId') as string | undefined) ?? c.req.header('x-request-id') ?? 'unknown';

    logger.info({ method, path, requestId }, 'Incoming request');

    await next();

    const duration = Math.round(performance.now() - start);
    const status = c.res.status;

    logger.info({ method, path, status, durationMs: duration, requestId }, 'Request completed');
  };
};
