import { describe, expect, it } from 'bun:test';
import { runWithRequestContext, type RequestContext } from '../context/request-context';
import { APP_ERROR_CODES, ForbiddenError } from '../errors';
import { requireMayManageUser } from './account-access';
import type { EffectivePermissions } from './rbac';

const HOLDINGS: Record<string, EffectivePermissions> = {
  admin: { superAdmin: false, permissions: ['users.read', 'users.update'] },
  clerk: { superAdmin: false, permissions: ['users.read'] },
  auditor: { superAdmin: false, permissions: ['orders.delete'] },
  root: { superAdmin: true, permissions: [] },
};

const as = <T>(actorId: string, fn: () => Promise<T>, withLookup = true): Promise<T> => {
  const context: RequestContext = {
    requestId: 'r1',
    locale: 'en',
    clientIp: 'unknown',
    actor: `user:${actorId}`,
    user: { id: actorId },
    ...(withLookup
      ? {
          permissions: () =>
            Promise.resolve(HOLDINGS[actorId] ?? { superAdmin: false, permissions: [] }),
          permissionsOf: (id: string) =>
            Promise.resolve(HOLDINGS[id] ?? { superAdmin: false, permissions: [] }),
        }
      : {}),
  };
  return runWithRequestContext(context, fn);
};

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof ForbiddenError ? error.errorCode : String(error)),
  );

describe('requireMayManageUser', () => {
  it('lets a caller change an account holding no more than they do, and returns its permissions', async () => {
    expect(await as('admin', () => requireMayManageUser('clerk'))).toEqual(HOLDINGS.clerk);
    expect(await as('admin', () => requireMayManageUser('nobody'))).toEqual({
      superAdmin: false,
      permissions: [],
    });
  });

  it('refuses an account holding a permission the caller lacks, or a super admin', async () => {
    for (const target of ['auditor', 'root']) {
      expect(await codeOf(as('admin', () => requireMayManageUser(target)))).toBe(
        APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
      );
    }
  });

  it('a super admin changes any account; anyone changes their own', async () => {
    expect(await as('root', () => requireMayManageUser('auditor'))).toEqual(HOLDINGS.auditor);
    expect(await as('clerk', () => requireMayManageUser('clerk'))).toEqual(HOLDINGS.clerk);
  });

  it('checks nothing outside a signed-in request; fails closed without the permission context', async () => {
    expect(await requireMayManageUser('root')).toBeUndefined();
    expect(await codeOf(as('admin', () => requireMayManageUser('clerk'), false))).toBe(
      APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
    );
  });
});
