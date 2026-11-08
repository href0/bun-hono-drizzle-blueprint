import { beforeEach, describe, expect, it } from 'bun:test';
import { CacheService, type CacheClient } from '../../core/cache';
import { runInFakeTransaction } from '../../database/transaction-host';
import { nowInstant } from '../../utils/datetime.util';
import type { RbacPermissionsRepository } from './rbac-permissions.repository';
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

const SOON = (seconds: number) => nowInstant().add({ seconds });

/** Runs `fn` in a stand-in transaction that commits: `@Transactional()` joins it, `afterCommit` work runs after. */
const inTx = <T>(fn: () => Promise<T>): Promise<T> => runInFakeTransaction({}, fn);

describe('RbacService', () => {
  let permissions: Record<string, unknown>;
  let userRoles: Record<string, unknown>;
  let userPermissions: Record<string, unknown>;
  let memory: ReturnType<typeof memoryCache>;
  const service = () =>
    new RbacService(
      permissions as unknown as RbacPermissionsRepository,
      userRoles as unknown as RbacUserRolesRepository,
      userPermissions as unknown as RbacUserPermissionsRepository,
      memory.cache,
      60,
    );

  beforeEach(() => {
    memory = memoryCache();
    permissions = {
      findGrantableById: () => Promise.resolve({ id: 'p1', key: 'orders.read' }),
      findMappedToRole: () =>
        Promise.resolve([
          { key: 'orders.read', retiredAt: null },
          { key: 'old.thing', retiredAt: {} },
        ]),
      findCounting: () => Promise.resolve([{ key: 'orders.read' }, { key: 'users.read' }]),
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

  it('forget drops the cached permissions of many users in batches, after the commit (D63)', async () => {
    const holders = Array.from({ length: 250 }, (_, index) => `u${String(index)}`);
    await inTx(() => service().forget(holders));
    expect(memory.deleted).toHaveLength(250);
  });
});
