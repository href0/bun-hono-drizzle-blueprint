import type { Hono, MiddlewareHandler } from 'hono';
import { createApp } from '../../src/app';
import { getRequestContext, setAuthenticatedUser } from '../../src/core/context/request-context';
import { signAccessToken } from '../../src/core/security/jwt';
import type { EffectivePermissions } from '../../src/core/security/rbac';

/** The user behind `authorize()` — a fixed id so tests can assert actor stamps (`user:<id>`). */
export const TEST_PRINCIPAL_ID = '0192f1d0-0000-7000-8000-00000000a11c';

/** What a test user may do: every permission (`super_admin`), or exactly these keys. */
export type TestGrant = 'super_admin' | readonly string[];

/** The permissions each user holds on an app made by `createTestApp()`. */
const grantsOf = new WeakMap<Hono, Map<string, EffectivePermissions>>();

const NOTHING: EffectivePermissions = { superAdmin: false, permissions: [] };

const toEffective = (grant: TestGrant): EffectivePermissions =>
  grant === 'super_admin'
    ? { superAdmin: true, permissions: [] }
    : { superAdmin: false, permissions: [...grant] };

/**
 * `createApp()` for tests of a module's HTTP contract: permissions come from `authorize()` instead
 * of the database (hermetic). A user nobody authorized holds no permission. The real lookup (RBAC
 * module, database + cache) is proven by the integration suite (`test/integration/rbac.int.ts`).
 */
export const createTestApp = (): Hono => {
  const grants = new Map<string, EffectivePermissions>();
  const app = createApp({
    permissionLookup: (userId) => Promise.resolve(grants.get(userId) ?? NOTHING),
  });
  grantsOf.set(app, grants);
  return app;
};

/**
 * Every versioned route requires an access token (default-deny). For tests of a module's own
 * contract this makes `app.request()` send `Authorization: Bearer <token of userId>` unless the
 * request sets its own header, and gives that user `grant` (default: every permission). The token
 * carries no permission: a role claim in it authorizes nothing (D53). Returns the same app.
 */
export const authorize = async (
  app: Hono,
  grant: TestGrant = 'super_admin',
  userId: string = TEST_PRINCIPAL_ID,
): Promise<Hono> => {
  const grants = grantsOf.get(app);
  if (grants === undefined) throw new Error('authorize() needs an app made by createTestApp()');
  grants.set(userId, toEffective(grant));
  const { token } = await signAccessToken({ userId, role: 'user' });
  const request = app.request.bind(app);
  app.request = (input, init, ...rest) => {
    const headers = new Headers(init?.headers);
    if (!headers.has('authorization')) headers.set('Authorization', `Bearer ${token}`);
    return request(input, { ...init, headers }, ...rest);
  };
  return app;
};

/**
 * For tests that mount a module's router on a bare `Hono` (after `requestContextMiddleware()`):
 * the request is signed in as `userId` holding `grant`, as `authenticate()` + `permissionContext()`
 * would leave it.
 */
export const signedIn =
  (grant: TestGrant = 'super_admin', userId: string = TEST_PRINCIPAL_ID): MiddlewareHandler =>
  async (_c, next) => {
    setAuthenticatedUser({ id: userId, role: 'user' });
    const context = getRequestContext();
    const effective = toEffective(grant);
    if (context) context.permissions = () => Promise.resolve(effective);
    await next();
  };
