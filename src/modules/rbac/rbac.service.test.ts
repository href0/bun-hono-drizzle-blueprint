import { beforeEach, describe, expect, it } from 'bun:test';
import { CacheService, type CacheClient } from '../../core/cache';
import { runWithRequestContext } from '../../core/context/request-context';
import {
  APP_ERROR_CODES,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors';
import type { Role } from '../../database/schema';
import { runInFakeTransaction } from '../../database/transaction-host';
import { nowInstant, parseInstant } from '../../utils/datetime.util';
import type { RbacPermissionsRepository } from './rbac-permissions.repository';
import type { RbacRolePermissionsRepository } from './rbac-role-permissions.repository';
import type { RbacRolesRepository } from './rbac-roles.repository';
import type {
  ActiveGrant,
  RbacUserPermissionsRepository,
} from './rbac-user-permissions.repository';
import type { RbacUserRolesRepository } from './rbac-user-roles.repository';
import { RbacService } from './rbac.service';
import type { SuperAdminsRepository } from '../../database/rbac/super-admins';

/** A Redis stand-in: values with their TTL, and every key deleted. */
const memoryCache = () => {
  const store = new Map<string, { value: string; ttl: number }>();
  const deleted: string[] = [];
  const client = {
    status: 'ready',
    get: (key: string) => Promise.resolve(store.get(key)?.value ?? null),
    set: (key: string, value: string, _ex: string, ttl: number) => {
      store.set(key, { value, ttl });
      return Promise.resolve('OK');
    },
    del: (key: string) => {
      deleted.push(key);
      store.delete(key);
      return Promise.resolve(1);
    },
    eval: () => Promise.resolve(null),
  } as unknown as CacheClient;
  return { cache: new CacheService(client), store, deleted };
};

const role = (key: string): Role => ({ id: `role-${key}`, key }) as Role;
const SOON = (seconds: number) => nowInstant().add({ seconds });

/** Runs `fn` in a stand-in transaction that commits: `@Transactional()` joins it, `afterCommit` work runs after. */
const inTx = <T>(fn: () => Promise<T>): Promise<T> => runInFakeTransaction({}, fn);

const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

describe('RbacService', () => {
  let roles: Record<string, unknown>;
  let permissions: Record<string, unknown>;
  let rolePermissions: Record<string, unknown>;
  let userRoles: Record<string, unknown>;
  let userPermissions: Record<string, unknown>;
  let memory: ReturnType<typeof memoryCache>;
  /** Other live, active super admins (src/database/rbac/super-admins.ts). */
  let otherSuperAdmins: string[] = ['u2'];
  const service = () =>
    new RbacService(
      roles as unknown as RbacRolesRepository,
      permissions as unknown as RbacPermissionsRepository,
      rolePermissions as unknown as RbacRolePermissionsRepository,
      userRoles as unknown as RbacUserRolesRepository,
      userPermissions as unknown as RbacUserPermissionsRepository,
      memory.cache,
      60,
      {
        lockOtherActiveHolders: () => Promise.resolve(otherSuperAdmins),
      } as unknown as SuperAdminsRepository,
    );

  beforeEach(() => {
    memory = memoryCache();
    roles = { findById: (id: string) => Promise.resolve(role(id.replace('role-', ''))) };
    permissions = {
      findGrantableById: () => Promise.resolve({ id: 'p1', key: 'orders.read' }),
      findMappedToRole: () =>
        Promise.resolve([
          { key: 'orders.read', retiredAt: null },
          { key: 'old.thing', retiredAt: {} },
        ]),
      findCounting: () => Promise.resolve([{ key: 'orders.read' }, { key: 'users.read' }]),
    };
    rolePermissions = {
      findLive: () => Promise.resolve(null),
      create: (input: object) => Promise.resolve({ id: 'rp1', ...input }),
      softDeleteById: () => Promise.resolve({}),
    };
    userRoles = {
      isLiveUser: () => Promise.resolve(true),
      findLive: () => Promise.resolve(null),
      create: (input: object) => Promise.resolve({ id: 'ur1', ...input }),
      softDeleteById: () => Promise.resolve({}),
      findHolderIds: () => Promise.resolve(['u1', 'u2']),
      findRoleKeys: () => Promise.resolve(['user']),
      findRolePermissionKeys: () => Promise.resolve(['orders.read', 'orders.create']),
    };
    userPermissions = {
      findLive: () => Promise.resolve(null),
      create: (input: object) => Promise.resolve({ id: 'up1', ...input }),
      softDeleteById: () => Promise.resolve({}),
      findActiveGrants: (): Promise<ActiveGrant[]> =>
        Promise.resolve([
          { key: 'orders.read', expiresAt: null },
          { key: 'users.read', expiresAt: null },
        ]),
    };
  });

  describe('getEffectivePermissions', () => {
    it('unites the permissions of the roles and the grants, sorted, and caches them for the TTL', async () => {
      const effective = await service().getEffectivePermissions('u1');

      expect(effective).toEqual({
        superAdmin: false,
        permissions: ['orders.create', 'orders.read', 'users.read'],
      });
      expect(memory.store.get('rbac:permissions:u1')?.ttl).toBe(60);
    });

    it('serves a cache hit without the database', async () => {
      memory.store.set('rbac:permissions:u1', {
        value: JSON.stringify({ superAdmin: false, permissions: ['x.read'] }),
        ttl: 60,
      });
      userRoles.findRoleKeys = () => Promise.reject(new Error('database read on a hit'));

      expect(await service().getEffectivePermissions('u1')).toEqual({
        superAdmin: false,
        permissions: ['x.read'],
      });
    });

    it('treats a malformed cache entry as a miss', async () => {
      memory.store.set('rbac:permissions:u1', {
        value: JSON.stringify({ permissions: 1 }),
        ttl: 60,
      });
      expect((await service().getEffectivePermissions('u1')).permissions).toHaveLength(3);
    });

    it('marks a super admin without listing permissions (later syncs count at once)', async () => {
      userRoles.findRoleKeys = () => Promise.resolve(['user', 'super_admin']);
      userRoles.findRolePermissionKeys = () => Promise.reject(new Error('not needed'));

      expect(await service().getEffectivePermissions('u1')).toEqual({
        superAdmin: true,
        permissions: [],
      });
      expect(await service().hasPermission('u1', 'anything.read')).toBe(true);
    });

    it('cuts the TTL to the first grant that expires sooner', async () => {
      userPermissions.findActiveGrants = () =>
        Promise.resolve([
          { key: 'a.read', expiresAt: SOON(3600) },
          { key: 'b.read', expiresAt: SOON(20) },
        ]);
      await service().getEffectivePermissions('u1');
      const ttl = memory.store.get('rbac:permissions:u1')?.ttl ?? 0;
      expect(ttl).toBeGreaterThanOrEqual(19);
      expect(ttl).toBeLessThanOrEqual(20);
    });

    it('answers hasPermission from the effective set', async () => {
      expect(await service().hasPermission('u1', 'orders.create')).toBe(true);
      expect(await service().hasPermission('u1', 'orders.delete')).toBe(false);
    });
  });

  describe('changes drop the cached permissions of every affected user', () => {
    it('assignRole / revokeRole: the user', async () => {
      await inTx(() => service().assignRole('u1', 'role-user'));
      expect(memory.deleted).toEqual(['rbac:permissions:u1']);

      userRoles.findLive = () => Promise.resolve({ id: 'ur1' });
      await inTx(() => service().revokeRole('u1', 'role-user'));
      expect(memory.deleted).toEqual(['rbac:permissions:u1', 'rbac:permissions:u1']);
    });

    it('mapPermission refuses a caller who does not hold the permission (escalation) and maps nothing', async () => {
      permissions.findGrantableById = () => Promise.resolve({ id: 'p1', key: 'orders.delete' });
      let creates = 0;
      rolePermissions.create = () => {
        creates += 1;
        return Promise.resolve({});
      };
      const caller = {
        requestId: 'r1',
        locale: 'en' as const,
        clientIp: 'unknown',
        actor: 'user:u9' as const,
        user: { id: 'u9' },
        permissions: () => Promise.resolve({ superAdmin: false, permissions: ['orders.read'] }),
      };
      const error = await errorOf(
        runWithRequestContext(caller, () =>
          inTx(() => service().mapPermission('role-staff', 'p1')),
        ),
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).errorCode).toBe(
        APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
      );
      expect(creates).toBe(0);
      expect(memory.deleted).toEqual([]);
    });

    it('mapPermission / unmapPermission: every holder of the role', async () => {
      await inTx(() => service().mapPermission('role-staff', 'p1'));
      rolePermissions.findLive = () => Promise.resolve({ id: 'rp1' });
      await inTx(() => service().unmapPermission('role-staff', 'p1'));
      expect(memory.deleted).toEqual([
        'rbac:permissions:u1',
        'rbac:permissions:u2',
        'rbac:permissions:u1',
        'rbac:permissions:u2',
      ]);
    });

    it('grantPermission / revokePermission: the user', async () => {
      const granted = await inTx(() =>
        service().grantPermission('u1', 'p1', { expiresAt: SOON(60), note: 'audit week' }),
      );
      expect(granted).toMatchObject({ userId: 'u1', permissionId: 'p1', note: 'audit week' });
      userPermissions.findLive = () => Promise.resolve({ id: 'up1' });
      await inTx(() => service().revokePermission('u1', 'p1'));
      expect(memory.deleted).toEqual(['rbac:permissions:u1', 'rbac:permissions:u1']);
    });

    it('drops nothing when the change is refused', async () => {
      userRoles.isLiveUser = () => Promise.resolve(false);
      expect(await errorOf(inTx(() => service().assignRole('u1', 'role-user')))).toBeInstanceOf(
        NotFoundError,
      );
      expect(memory.deleted).toEqual([]);
    });
  });

  describe('refusals', () => {
    it('never maps the super admin role (it holds everything)', async () => {
      for (const change of <(() => Promise<unknown>)[]>[
        () => service().mapPermission('role-super_admin', 'p1'),
        () => service().unmapPermission('role-super_admin', 'p1'),
      ]) {
        expect(await errorOf(inTx(change))).toBeInstanceOf(ConflictError);
      }
    });

    it('404 for a missing role, user, permission (or a retired one) and a missing assignment', async () => {
      const notFound = async (change: () => Promise<unknown>) => {
        expect(await errorOf(inTx(change))).toBeInstanceOf(NotFoundError);
      };

      roles.findById = () => Promise.resolve(null);
      await notFound(() => service().assignRole('u1', 'role-x'));
      roles.findById = (id: string) => Promise.resolve(role(id.replace('role-', '')));
      permissions.findGrantableById = () => Promise.resolve(null);
      await notFound(() => service().mapPermission('role-staff', 'p1'));
      await notFound(() => service().grantPermission('u1', 'p1'));
      await notFound(() => service().unmapPermission('role-staff', 'p1'));
      await notFound(() => service().revokeRole('u1', 'role-staff'));
      await notFound(() => service().revokePermission('u1', 'p1'));
    });

    it('409 for an assignment that already exists, also when a concurrent write wins the race', async () => {
      userRoles.findLive = () => Promise.resolve({ id: 'ur1' });
      rolePermissions.findLive = () => Promise.resolve({ id: 'rp1' });
      userPermissions.findLive = () => Promise.resolve({ id: 'up1' });
      for (const change of <(() => Promise<unknown>)[]>[
        () => service().assignRole('u1', 'role-user'),
        () => service().mapPermission('role-staff', 'p1'),
        () => service().grantPermission('u1', 'p1'),
      ]) {
        expect(await errorOf(inTx(change))).toBeInstanceOf(ConflictError);
      }

      userRoles.findLive = () => Promise.resolve(null);
      userRoles.create = () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' }));
      expect(await errorOf(inTx(() => service().assignRole('u1', 'role-user')))).toBeInstanceOf(
        ConflictError,
      );
      userRoles.create = () => Promise.reject(new Error('other'));
      expect(await errorOf(inTx(() => service().assignRole('u1', 'role-user')))).toEqual(
        new Error('other'),
      );
    });

    it('400 for a grant that would already have expired', async () => {
      const past = parseInstant('2020-01-01T00:00:00Z');
      expect(
        await errorOf(inTx(() => service().grantPermission('u1', 'p1', { expiresAt: past }))),
      ).toBeInstanceOf(BadRequestError);
    });
  });

  describe('user access (D68, D69)', () => {
    /** Runs `fn` in a committing stand-in transaction as signed-in user `id` holding `effective`. */
    const as = <T>(
      id: string,
      effective: { superAdmin: boolean; permissions: string[] },
      fn: () => Promise<T>,
    ) =>
      runWithRequestContext(
        {
          requestId: 'r1',
          locale: 'en',
          clientIp: 'unknown',
          actor: `user:${id}`,
          user: { id },
          permissions: () => Promise.resolve(effective),
        },
        () => inTx(fn),
      );
    const ROOT = { superAdmin: true, permissions: [] };
    const codeOf = async (promise: Promise<unknown>) => {
      const error = await errorOf(promise);
      return error instanceof ForbiddenError || error instanceof ConflictError
        ? error.errorCode
        : String(error);
    };

    it('lists my permissions: the effective ones, or every key that counts for a super admin', async () => {
      expect(await service().listMyPermissions('u1')).toEqual(
        await service().getEffectivePermissions('u1'),
      );
      userRoles.findRoleKeys = () => Promise.resolve(['super_admin']);
      expect(await service().listMyPermissions('u2')).toEqual({
        superAdmin: true,
        permissions: ['orders.read', 'users.read'],
      });
    });

    it('lists the roles and grants of a live user; an unknown user is a 404', async () => {
      userRoles.findRolesOf = () => Promise.resolve([role('user')]);
      userPermissions.findGrantsOf = () => Promise.resolve([]);
      expect(await service().listUserRoles('u1')).toEqual([role('user')]);
      expect(await service().listUserGrants('u1')).toEqual([]);
      userRoles.isLiveUser = () => Promise.resolve(false);
      expect(await errorOf(service().listUserRoles('u1'))).toBeInstanceOf(NotFoundError);
      expect(await errorOf(service().listUserGrants('u1'))).toBeInstanceOf(NotFoundError);
    });

    it('assigning a role needs every permission it carries (retired ones aside); super_admin only by a super admin', async () => {
      const holder = { superAdmin: false, permissions: ['orders.read'] };
      await as('a1', holder, () => service().assignRole('u1', 'role-staff'));
      expect(
        await codeOf(
          as('a1', { superAdmin: false, permissions: [] }, () =>
            service().assignRole('u1', 'role-staff'),
          ),
        ),
      ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);
      expect(
        await codeOf(as('a1', holder, () => service().assignRole('u1', 'role-super_admin'))),
      ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);
      await as('root', ROOT, () => service().assignRole('u1', 'role-super_admin'));
    });

    it('taking access away needs what it takes (D74): a mapping, a role, a grant', async () => {
      rolePermissions.findLive = () => Promise.resolve({ id: 'rp1' });
      userRoles.findLive = () => Promise.resolve({ id: 'ur1' });
      userPermissions.findLive = () => Promise.resolve({ id: 'up1' });
      const deleted: string[] = [];
      for (const repo of [rolePermissions, userRoles, userPermissions]) {
        repo.softDeleteById = (id: string) => {
          deleted.push(id);
          return Promise.resolve({});
        };
      }
      const lacking = { superAdmin: false, permissions: ['users.read'] };
      const refusal = async (fn: () => Promise<unknown>) => {
        const error = await errorOf(as('a1', lacking, fn));
        return error instanceof ForbiddenError
          ? [error.errorCode, error.details.map(({ field }) => field)]
          : String(error);
      };
      const denied = [APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN, ['orders.read']];

      expect(await refusal(() => service().unmapPermission('role-staff', 'p1'))).toEqual(denied);
      // The role carries orders.read (and a retired permission, which is not needed).
      expect(await refusal(() => service().revokeRole('u1', 'role-staff'))).toEqual(denied);
      expect(await refusal(() => service().revokePermission('u1', 'p1'))).toEqual(denied);
      expect(deleted).toEqual([]);

      const holder = { superAdmin: false, permissions: ['orders.read'] };
      await as('a1', holder, () => service().unmapPermission('role-staff', 'p1'));
      await as('a1', holder, () => service().revokeRole('u1', 'role-staff'));
      await as('a1', holder, () => service().revokePermission('u1', 'p1'));
      expect(deleted).toEqual(['rp1', 'ur1', 'up1']);
    });

    it('a permission that no longer counts (retired, deleted) is taken away without holding it', async () => {
      permissions.findGrantableById = () => Promise.resolve(null);
      rolePermissions.findLive = () => Promise.resolve({ id: 'rp1' });
      userPermissions.findLive = () => Promise.resolve({ id: 'up1' });
      const nothing = { superAdmin: false, permissions: [] };
      await as('a1', nothing, () => service().unmapPermission('role-staff', 'p-old'));
      await as('a1', nothing, () => service().revokePermission('u1', 'p-old'));
    });

    it('PUT a role: given once, then a no-op', async () => {
      expect(await inTx(() => service().putUserRole('u1', 'role-staff'))).toEqual({
        created: true,
      });
      userRoles.findLive = () => Promise.resolve({ id: 'ur1' });
      expect(await inTx(() => service().putUserRole('u1', 'role-staff'))).toEqual({
        created: false,
      });
    });

    it('revoking super_admin: only by a super admin, never one’s own, never the last active holder', async () => {
      userRoles.findLive = () => Promise.resolve({ id: 'ur1' });
      otherSuperAdmins = ['u2'];

      expect(
        await codeOf(
          as('a1', { superAdmin: false, permissions: ['user-roles.delete'] }, () =>
            service().revokeRole('u1', 'role-super_admin'),
          ),
        ),
      ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);
      expect(
        await codeOf(as('u1', ROOT, () => service().revokeRole('u1', 'role-super_admin'))),
      ).toBe(APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN);
      await as('u2', ROOT, () => service().revokeRole('u1', 'role-super_admin'));

      // u2 is the only other holder, and is inactive: u1 is the last who can sign in.
      otherSuperAdmins = [];
      expect(
        await codeOf(as('root', ROOT, () => service().revokeRole('u1', 'role-super_admin'))),
      ).toBe(APP_ERROR_CODES.CONFLICT);
    });

    it('granting needs the permission; PUT grants once, then changes expiry and note under the same rule', async () => {
      const holder = { superAdmin: false, permissions: ['orders.read'] };
      expect(
        await codeOf(
          as('a1', { superAdmin: false, permissions: [] }, () =>
            service().grantPermission('u1', 'p1'),
          ),
        ),
      ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);

      const created = await as('a1', holder, () =>
        service().putGrant('u1', 'p1', { note: 'audit' }),
      );
      expect(created.created).toBe(true);

      const later = nowInstant().add({ hours: 1 });
      userPermissions.findLive = () => Promise.resolve({ id: 'up1' });
      userPermissions.updateById = (_id: string, patch: object) =>
        Promise.resolve({ id: 'up1', ...patch });
      memory.deleted.length = 0;
      const changed = await as('a1', holder, () =>
        service().putGrant('u1', 'p1', { expiresAt: later }),
      );
      expect(changed).toMatchObject({
        grant: {
          grant: { id: 'up1', expiresAt: later, note: null },
          permission: { key: 'orders.read' },
        },
        created: false,
      });
      expect(memory.deleted).toEqual(['rbac:permissions:u1']);

      expect(
        await codeOf(
          as('a1', { superAdmin: false, permissions: [] }, () => service().putGrant('u1', 'p1')),
        ),
      ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);
      expect(
        await errorOf(
          inTx(() =>
            service().putGrant('u1', 'p1', { expiresAt: nowInstant().subtract({ hours: 1 }) }),
          ),
        ),
      ).toBeInstanceOf(BadRequestError);
      userPermissions.updateById = () => Promise.resolve(null);
      expect(await errorOf(inTx(() => service().putGrant('u1', 'p1')))).toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it('drops the cache of many holders in batches', async () => {
    const holders = Array.from({ length: 250 }, (_, index) => `u${String(index)}`);
    userRoles.findHolderIds = () => Promise.resolve(holders);
    await inTx(() => service().mapPermission('role-staff', 'p1'));
    expect(memory.deleted).toHaveLength(250);
  });
});
