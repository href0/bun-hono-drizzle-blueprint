import type { MiddlewareHandler } from 'hono';
import { uniqueSymbol } from 'hono-openapi';
import { getRequestContext } from '../context/request-context';
import { APP_ERROR_CODES, ForbiddenError, type AppErrorCode } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { documentErrors } from '../openapi/describe-endpoint';
import type { PermissionEndpointsSource, PermissionLookup } from '../security/rbac';
import { currentUser } from './authenticate';

/**
 * Operation extension listing who may call the route — alternatives: `permission:<key>`,
 * `self:<param>`, `any-user`, and the callers the channel guards add.
 */
const ALLOWED_CALLERS = 'x-allowed-callers';

/** `x-allowed-callers` entry of a route open to every signed-in user (`allowAnyUser()`). */
export const ANY_USER_CALLER = 'any-user';

const permissionForbidden = (): ForbiddenError =>
  new ForbiddenError(I18N_MESSAGES.PERMISSION_FORBIDDEN, {
    code: APP_ERROR_CODES.PERMISSION_FORBIDDEN,
  });

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
 * Makes the signed-in user's effective permissions available to the guards below (D49, D53):
 * resolved through `lookup` at most once per request, and only when a route asks — routes behind
 * `allowAnyUser()` never touch the database or the cache. Also hands the RBAC module the
 * endpoints each permission opens (`endpoints`, D47: built from the app's OpenAPI document, once
 * per app). Mounted by `src/app.ts` after `authenticate()`; without a user (public routes) it
 * does nothing.
 */
export const permissionContext =
  ({
    lookup,
    endpoints,
  }: {
    lookup: PermissionLookup;
    endpoints?: PermissionEndpointsSource;
  }): MiddlewareHandler =>
  async (_c, next) => {
    const context = getRequestContext();
    const user = context?.user;
    if (context && user) {
      let resolved: ReturnType<PermissionLookup> | undefined;
      context.permissions = (): ReturnType<PermissionLookup> => (resolved ??= lookup(user.id));
      context.permissionsOf = lookup;
      if (endpoints) context.permissionEndpoints = endpoints;
    }
    await next();
  };

/** Whether the current user holds `permission`; no `permissionContext()` → no (fail closed). */
const holds = async (permission: string): Promise<boolean> => {
  const resolve = getRequestContext()?.permissions;
  if (resolve === undefined) return false;
  const effective = await resolve();
  return effective.superAdmin || effective.permissions.includes(permission);
};

/**
 * Allows the route to users holding `permission` (D47–D49): through a role or a per-user grant, or
 * as super admin; anyone else → 403 `ERR_PERMISSION_FORBIDDEN`. A revocation applies to the next
 * request (permissions are not in the token, D53). Runs after `authenticate()`; on a public route
 * (no user) it answers 401.
 */
export const requirePermission = (permission: string): MiddlewareHandler =>
  documentsForbidden(
    async (_c, next) => {
      currentUser();
      if (!(await holds(permission))) throw permissionForbidden();
      await next();
    },
    APP_ERROR_CODES.PERMISSION_FORBIDDEN,
    [`permission:${permission}`],
  );

/**
 * Allows the user named by the route parameter `param` (their own resource, e.g. `/users/:id`) and
 * users holding `permission`; anyone else → 403 `ERR_PERMISSION_FORBIDDEN`. The same 403 whether the
 * resource exists or not, so it reveals nothing about other users.
 */
export const requireSelfOrPermission = (param: string, permission: string): MiddlewareHandler =>
  documentsForbidden(
    async (c, next) => {
      const user = currentUser();
      if (user.id !== c.req.param(param) && !(await holds(permission))) {
        throw permissionForbidden();
      }
      await next();
    },
    APP_ERROR_CODES.PERMISSION_FORBIDDEN,
    [`self:${param}`, `permission:${permission}`],
  );

/**
 * States that every signed-in user may call the route (their own session, profile, password): no
 * permission is checked, but the choice is explicit — a route with neither this nor a permission
 * guard is a mistake (D49). Answers 401 without a user.
 */
export const allowAnyUser = (): MiddlewareHandler =>
  Object.assign(
    async (_c: Parameters<MiddlewareHandler>[0], next: Parameters<MiddlewareHandler>[1]) => {
      currentUser();
      await next();
    },
    { [uniqueSymbol]: { spec: { [ALLOWED_CALLERS]: [ANY_USER_CALLER] } } },
  ) as MiddlewareHandler;
