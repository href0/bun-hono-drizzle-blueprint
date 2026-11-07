import type { MiddlewareHandler } from 'hono';
import { getRequestContext, setAuthenticatedUser } from '../../src/core/context/request-context';
import type { EffectivePermissions } from '../../src/core/security/rbac';

/** The user behind `authorize()` / `signedIn()` — a fixed id so tests can assert actor stamps (`user:<id>`). */
export const TEST_PRINCIPAL_ID = '0192f1d0-0000-7000-8000-00000000a11c';

/** What a test user may do: every permission (`super_admin`), or exactly these keys. */
export type TestGrant = 'super_admin' | readonly string[];

export const toEffective = (grant: TestGrant): EffectivePermissions =>
  grant === 'super_admin'
    ? { superAdmin: true, permissions: [] }
    : { superAdmin: false, permissions: [...grant] };

/**
 * For tests that mount a module's router on a bare `Hono` (after `requestContextMiddleware()`):
 * the request is signed in as `userId` holding `grant`, as `authenticate()` + `permissionContext()`
 * would leave it.
 */
export const signedIn =
  (grant: TestGrant = 'super_admin', userId: string = TEST_PRINCIPAL_ID): MiddlewareHandler =>
  async (_c, next) => {
    setAuthenticatedUser({ id: userId });
    const context = getRequestContext();
    const effective = toEffective(grant);
    if (context) context.permissions = () => Promise.resolve(effective);
    await next();
  };
