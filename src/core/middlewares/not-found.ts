import type { NotFoundHandler } from 'hono';
import { APP_ERROR_CODES } from '../errors/error-codes';
import { NotFoundError } from '../errors/not-found.error';
import { sendError } from './error-handler';

export const notFoundHandler: NotFoundHandler = (c) =>
  sendError(
    c,
    new NotFoundError(`Route not found: ${c.req.method} ${c.req.path}`, {
      code: APP_ERROR_CODES.ROUTE_NOT_FOUND,
    }),
  );
