import type { NotFoundHandler } from 'hono';
import { APP_ERROR_CODES } from '../errors/error-codes';
import { NotFoundError } from '../errors/not-found.error';
import { routeNotFoundMessage } from '../i18n/messages';
import { sendError } from './error-handler';

export const notFoundHandler: NotFoundHandler = (c) =>
  sendError(
    c,
    new NotFoundError(routeNotFoundMessage(c.req.method, c.req.path), {
      code: APP_ERROR_CODES.ROUTE_NOT_FOUND,
    }),
  );
