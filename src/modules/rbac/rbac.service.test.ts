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
  const service = () =>
    new RbacService(
      roles as unknown as RbacRolesRepository,
      permissions as unknown as RbacPermissionsRepository,
      rolePermissions as unknown as RbacRolePermissionsRepository,
      userRoles as unknown as RbacUserRolesRepository,
      userPermissions as unknown as RbacUserPermissionsRepository,
      memory.cache,
      60,
    );

  beforeEach(() => {
    memory = memoryCache();
    roles = { findById: (id: string) => Promise.resolve(role(id.replace('role-', ''))) };
    permissions = { findGrantableById: () => Promise.resolve({ id: 'p1' }) };
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

  it('drops the cache of many holders in batches', async () => {
    const holders = Array.from({ length: 250 }, (_, index) => `u${String(index)}`);
    userRoles.findHolderIds = () => Promise.resolve(holders);
    await inTx(() => service().mapPermission('role-staff', 'p1'));
    expect(memory.deleted).toHaveLength(250);
  });
});
