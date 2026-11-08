import { describe, expect, it } from 'bun:test';
import { runWithRequestContext, type RequestContext } from '../../core/context/request-context';
import { APP_ERROR_CODES, ForbiddenError } from '../../core/errors';
import type { EffectivePermissions } from '../../core/security/rbac';
import { actorCanGive, requireActorHolds } from './rbac-grant-guard.util';

const contextOf = (permissions?: EffectivePermissions): RequestContext => ({
  requestId: 'r1',
  locale: 'en',
  clientIp: 'unknown',
  actor: 'user:u1',
  user: { id: 'u1' },
  ...(permissions ? { permissions: () => Promise.resolve(permissions) } : {}),
});

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof ForbiddenError ? error.errorCode : 'other'),
  );

describe('requireActorHolds', () => {
  it('allows a caller holding every key, and a super admin', async () => {
    const holder = contextOf({ superAdmin: false, permissions: ['orders.read', 'orders.update'] });
    await runWithRequestContext(holder, () => requireActorHolds(['orders.read', 'orders.update']));
    const root = contextOf({ superAdmin: true, permissions: [] });
    await runWithRequestContext(root, () => requireActorHolds(['anything.at-all']));
  });

  it('refuses with ERR_PERMISSION_ESCALATION_FORBIDDEN a caller missing one key', async () => {
    const holder = contextOf({ superAdmin: false, permissions: ['orders.read'] });
    expect(
      await codeOf(
        runWithRequestContext(holder, () => requireActorHolds(['orders.read', 'orders.delete'])),
      ),
    ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);
  });

  it('fails closed for a signed-in user without a permission context', async () => {
    expect(
      await codeOf(runWithRequestContext(contextOf(), () => requireActorHolds(['orders.read']))),
    ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);
  });

  it('checks nothing without a signed-in user (seeds, jobs: actor system)', async () => {
    await requireActorHolds(['orders.read']);
    const anonymous: RequestContext = {
      requestId: 'r2',
      locale: 'en',
      clientIp: 'unknown',
      actor: 'anonymous',
    };
    await runWithRequestContext(anonymous, () => requireActorHolds(['orders.read']));
  });
});

describe('actorCanGive', () => {
  const keys = ['orders.read', 'orders.delete'];
  const answers = async (context?: RequestContext): Promise<boolean[]> => {
    const ask = async () => {
      const canGive = await actorCanGive();
      return keys.map(canGive);
    };
    return context ? runWithRequestContext(context, ask) : ask();
  };

  it('a caller may give what they hold; a super admin everything', async () => {
    expect(await answers(contextOf({ superAdmin: false, permissions: ['orders.read'] }))).toEqual([
      true,
      false,
    ]);
    expect(await answers(contextOf({ superAdmin: true, permissions: [] }))).toEqual([true, true]);
  });

  it('fails closed without a permission context; everything without a signed-in user', async () => {
    expect(await answers(contextOf())).toEqual([false, false]);
    expect(await answers()).toEqual([true, true]);
  });
});
