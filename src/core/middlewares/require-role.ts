import type { MiddlewareHandler } from 'hono';
import { uniqueSymbol } from 'hono-openapi';
import { APP_ERROR_CODES, ForbiddenError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { errorResponse } from '../openapi/describe-endpoint';
import type { Role } from '../security/roles';
import { currentUser } from './authenticate';

/**
 * Allows the route only to the given roles (plan D6): another role → 403 `ERR_ROLE_FORBIDDEN`.
 * Runs after `authenticate()`; on a public route (no user) it answers 401. Documents its 403 in
 * OpenAPI itself, like `validate()` documents 400.
 */
export const requireRole = (...roles: [Role, ...Role[]]): MiddlewareHandler => {
  const middleware: MiddlewareHandler = async (_c, next) => {
    if (!roles.includes(currentUser().role)) {
      throw new ForbiddenError(I18N_MESSAGES.ROLE_FORBIDDEN, {
        code: APP_ERROR_CODES.ROLE_FORBIDDEN,
      });
    }
    await next();
  };
  return Object.assign(middleware, {
    [uniqueSymbol]: { spec: { responses: { 403: errorResponse(403) } } },
  });
};
