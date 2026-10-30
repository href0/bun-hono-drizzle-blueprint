import type { MiddlewareHandler } from 'hono';
import { uniqueSymbol } from 'hono-openapi';
import { APP_ERROR_CODES, ForbiddenError, type AppErrorCode } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { documentErrors } from '../openapi/describe-endpoint';
import type { Role } from '../security/roles';
import { currentUser } from './authenticate';

/** Operation extension listing who may call the route (`admin`, `self:<param>`, …). */
const ALLOWED_CALLERS = 'x-allowed-callers';

const roleForbidden = (): ForbiddenError =>
  new ForbiddenError(I18N_MESSAGES.ROLE_FORBIDDEN, { code: APP_ERROR_CODES.ROLE_FORBIDDEN });

/**
 * Documents the 403 (with `code`) in OpenAPI from the middleware itself, like `validate()` documents
 * 400, plus who is allowed: arrays of several middlewares on one route are concatenated.
 */
export const documentsForbidden = (
  middleware: MiddlewareHandler,
  code: AppErrorCode,
  allowedCallers: readonly string[] = [],
): MiddlewareHandler =>
  Object.assign(middleware, {
    [uniqueSymbol]: {
      spec: {
        ...documentErrors([{ status: 403, codes: [code] }]),
        ...(allowedCallers.length > 0 ? { [ALLOWED_CALLERS]: allowedCallers } : {}),
      },
    },
  });

/**
 * Allows the route only to the given roles (D6): another role → 403 `ERR_ROLE_FORBIDDEN`.
 * Runs after `authenticate()`; on a public route (no user) it answers 401.
 */
export const requireRole = (...roles: [Role, ...Role[]]): MiddlewareHandler =>
  documentsForbidden(
    async (_c, next) => {
      if (!roles.includes(currentUser().role)) throw roleForbidden();
      await next();
    },
    APP_ERROR_CODES.ROLE_FORBIDDEN,
    roles,
  );

/**
 * Allows the user named by the route parameter `param` (their own resource, e.g. `/users/:id`)
 * and the given roles; anyone else → 403 `ERR_ROLE_FORBIDDEN`. The same 403 whether the resource
 * exists or not, so it reveals nothing about other users.
 */
export const requireSelfOrRole = (param: string, ...roles: [Role, ...Role[]]): MiddlewareHandler =>
  documentsForbidden(
    async (c, next) => {
      const user = currentUser();
      if (user.id !== c.req.param(param) && !roles.includes(user.role)) throw roleForbidden();
      await next();
    },
    APP_ERROR_CODES.ROLE_FORBIDDEN,
    [`self:${param}`, ...roles],
  );
