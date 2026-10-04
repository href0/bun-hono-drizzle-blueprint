import type { MiddlewareHandler } from 'hono';

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const existingId = c.req.header('x-request-id');
    const requestId =
      existingId || `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

    c.set('requestId', requestId);
    c.header('x-request-id', requestId);

    await next();
  };
};
