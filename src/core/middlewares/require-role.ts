import type { MiddlewareHandler } from 'hono';
import { uniqueSymbol } from 'hono-openapi';
import { APP_ERROR_CODES, ForbiddenError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { errorResponse } from '../openapi/describe-endpoint';
import type { Role } from '../security/roles';
import { currentUser } from './authenticate';

const roleForbidden = (): ForbiddenError =>
  new ForbiddenError(I18N_MESSAGES.ROLE_FORBIDDEN, { code: APP_ERROR_CODES.ROLE_FORBIDDEN });

/** Documents the 403 in OpenAPI from the middleware itself, like `validate()` documents 400. */
const documented = (middleware: MiddlewareHandler): MiddlewareHandler =>
  Object.assign(middleware, {
    [uniqueSymbol]: { spec: { responses: { 403: errorResponse(403) } } },
  });

/**
 * Allows the route only to the given roles (plan D6): another role → 403 `ERR_ROLE_FORBIDDEN`.
 * Runs after `authenticate()`; on a public route (no user) it answers 401.
 */
export const requireRole = (...roles: [Role, ...Role[]]): MiddlewareHandler =>
  documented(async (_c, next) => {
    if (!roles.includes(currentUser().role)) throw roleForbidden();
    await next();
  });

/**
 * Allows the user named by the route parameter `param` (their own resource, e.g. `/users/:id`)
 * and the given roles; anyone else → 403 `ERR_ROLE_FORBIDDEN`. The same 403 whether the resource
 * exists or not, so it reveals nothing about other users.
 */
export const requireSelfOrRole = (param: string, ...roles: [Role, ...Role[]]): MiddlewareHandler =>
  documented(async (c, next) => {
    const user = currentUser();
    if (user.id !== c.req.param(param) && !roles.includes(user.role)) throw roleForbidden();
    await next();
  });
