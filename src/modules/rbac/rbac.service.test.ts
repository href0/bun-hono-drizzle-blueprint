import { beforeEach, describe, expect, it } from 'bun:test';
import { CacheService, type CacheClient } from '../../core/cache';
import { runWithRequestContext } from '../../core/context/request-context';
import {
  APP_ERROR_CODES,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors';
import type { Role } from '../../database/schema';
import { runInFakeTransaction } from '../../database/transaction-host';
import { nowInstant, parseInstant } from '../../utils/datetime.util';
import type { RbacPermissionsRepository } from './rbac-permissions.repository';
import type { GrantItem } from './rbac-replace.dto';
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

  describe('replaceRolePermissions (D72, D74)', () => {
    const live = (id: string, key: string, retired = false) => ({
      mapping: { id: `rp-${id}` },
      permission: { id, key, retiredAt: retired ? {} : null },
    });
    const CATALOG = new Map(
      [
        ['p-read', 'orders.read'],
        ['p-create', 'orders.create'],
        ['p-delete', 'orders.delete'],
      ].map(([id, key]) => [id, { id, key, retiredAt: null }]),
    );
    let created: string[];
    let unmapped: string[];
    const asCaller = <T>(held: string[] | 'root', fn: () => Promise<T>) =>
      runWithRequestContext(
        {
          requestId: 'r1',
          locale: 'en',
          clientIp: 'unknown',
          actor: 'user:a1',
          user: { id: 'a1' },
          permissions: () =>
            Promise.resolve(
              held === 'root'
                ? { superAdmin: true, permissions: [] }
                : { superAdmin: false, permissions: held },
            ),
        },
        () => inTx(fn),
      );
    const replace = (ids: string[]) => service().replaceRolePermissions('role-staff', ids);
    const keys = (items: { key: string }[]) => items.map(({ key }) => key);

    beforeEach(() => {
      created = [];
      unmapped = [];
      // The role holds orders.read, orders.delete and a retired permission.
      rolePermissions.findMappingsOf = () =>
        Promise.resolve([
          live('p-delete', 'orders.delete'),
          live('p-old', 'old.thing', true),
          live('p-read', 'orders.read'),
        ]);
      permissions.findGrantableByIds = (ids: string[]) =>
        Promise.resolve(ids.flatMap((id) => CATALOG.get(id) ?? []));
      rolePermissions.create = (input: { permissionId: string }) => {
        created.push(input.permissionId);
        return Promise.resolve({});
      };
      rolePermissions.softDeleteById = (id: string) => {
        unmapped.push(id);
        return Promise.resolve({});
      };
    });

    it('writes only the difference, drops the holders’ cache once, reports each part', async () => {
      const change = await asCaller(['orders.read', 'orders.create', 'orders.delete'], () =>
        replace(['p-read', 'p-create']),
      );
      expect(created).toEqual(['p-create']);
      // The retired permission goes without being held: it gives nothing.
      expect(unmapped).toEqual(['rp-p-delete', 'rp-p-old']);
      expect(memory.deleted).toEqual(['rbac:permissions:u1', 'rbac:permissions:u2']);
      expect([keys(change.added), keys(change.removed), keys(change.unchanged)]).toEqual([
        ['orders.create'],
        ['orders.delete', 'old.thing'],
        ['orders.read'],
      ]);
    });

    it('the same set again writes nothing and drops no cache; [] removes everything', async () => {
      const same = await asCaller('root', () => replace(['p-read', 'p-old', 'p-delete']));
      expect([created, unmapped, memory.deleted]).toEqual([[], [], []]);
      expect(keys(same.unchanged)).toEqual(['orders.delete', 'old.thing', 'orders.read']);

      await asCaller('root', () => replace([]));
      expect(unmapped).toEqual(['rp-p-delete', 'rp-p-old', 'rp-p-read']);
    });

    it('an id that cannot be given is a 400 naming its index, before any write', async () => {
      const error = await errorOf(asCaller('root', () => replace(['p-read', 'p-gone', 'p-new'])));
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details.map(({ field }) => field)).toEqual([
        'permissionIds.1',
        'permissionIds.2',
      ]);
      expect([created, unmapped, memory.deleted]).toEqual([[], [], []]);
    });

    it('the caller must hold every permission added or removed: 403 naming each, nothing written', async () => {
      const error = await errorOf(asCaller(['orders.read'], () => replace(['p-read', 'p-create'])));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).details.map(({ field }) => field)).toEqual([
        'orders.create',
        'orders.delete',
      ]);
      expect([created, unmapped, memory.deleted]).toEqual([[], [], []]);
    });

    it('super_admin has no mapping (409); seeds and jobs (no signed-in user) are not checked', async () => {
      expect(
        await errorOf(inTx(() => service().replaceRolePermissions('role-super_admin', ['p-read']))),
      ).toBeInstanceOf(ConflictError);
      await inTx(() => replace(['p-create']));
      expect(created).toEqual(['p-create']);
    });

    it('a concurrent identical mapping is the same 409 as the per-item PUT', async () => {
      rolePermissions.create = () =>
        Promise.reject(Object.assign(new Error('dup'), { code: '23505' }));
      expect(await errorOf(asCaller('root', () => replace(['p-read', 'p-create'])))).toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe('replaceUserRoles (D72, D74)', () => {
    /** What each role carries (`findMappedToRole`). */
    const CARRIES: Record<string, string[]> = {
      'role-staff': ['orders.read'],
      'role-auditor': ['reports.read'],
      'role-user': [],
    };
    let given: string[];
    let revoked: string[];
    const asCaller = <T>(id: string, held: string[] | 'root', fn: () => Promise<T>) =>
      runWithRequestContext(
        {
          requestId: 'r1',
          locale: 'en',
          clientIp: 'unknown',
          actor: `user:${id}`,
          user: { id },
          permissions: () =>
            Promise.resolve(
              held === 'root'
                ? { superAdmin: true, permissions: [] }
                : { superAdmin: false, permissions: held },
            ),
        },
        () => inTx(fn),
      );
    const replace = (ids: string[]) => service().replaceUserRoles('u1', ids);
    const keys = (items: { key: string }[]) => items.map(({ key }) => key);
    const holding = (...assigned: string[]) => {
      userRoles.findAssignmentsOf = () =>
        Promise.resolve(
          assigned.map((key) => ({ assignment: { id: `ur-${key}` }, role: role(key) })),
        );
    };

    beforeEach(() => {
      given = [];
      revoked = [];
      holding('staff', 'user');
      roles.findLiveByIds = (ids: string[]) =>
        Promise.resolve(
          ids.filter((id) => id !== 'role-gone').map((id) => role(id.replace('role-', ''))),
        );
      permissions.findMappedToRole = (roleId: string) =>
        Promise.resolve((CARRIES[roleId] ?? []).map((key) => ({ key, retiredAt: null })));
      userRoles.create = (input: { roleId: string }) => {
        given.push(input.roleId);
        return Promise.resolve({});
      };
      userRoles.softDeleteById = (id: string) => {
        revoked.push(id);
        return Promise.resolve({});
      };
    });

    it('writes only the difference, drops the user’s cache once, reports each part', async () => {
      const change = await asCaller('a1', ['orders.read', 'reports.read'], () =>
        replace(['role-user', 'role-auditor']),
      );
      expect([given, revoked]).toEqual([['role-auditor'], ['ur-staff']]);
      expect(memory.deleted).toEqual(['rbac:permissions:u1']);
      expect([keys(change.added), keys(change.removed), keys(change.unchanged)]).toEqual([
        ['auditor'],
        ['staff'],
        ['user'],
      ]);
    });

    it('the same set writes nothing and drops no cache; an unknown role is a 400 at its index', async () => {
      await asCaller('a1', [], () => replace(['role-user', 'role-staff']));
      expect([given, revoked, memory.deleted]).toEqual([[], [], []]);

      const error = await errorOf(
        asCaller('a1', 'root', () => replace(['role-user', 'role-gone'])),
      );
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details.map(({ field }) => field)).toEqual(['roleIds.1']);
      expect([given, revoked]).toEqual([[], []]);
    });

    it('the caller must hold what every role added or removed carries: one 403 naming all', async () => {
      // Adds auditor (reports.read) and removes staff (orders.read); holds neither.
      const error = await errorOf(asCaller('a1', [], () => replace(['role-user', 'role-auditor'])));
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).details.map(({ field }) => field)).toEqual([
        'orders.read',
        'reports.read',
      ]);
      expect([given, revoked, memory.deleted]).toEqual([[], [], []]);
    });

    it('super_admin: only by a super admin, never one’s own, never the last active holder', async () => {
      const codeOf = async (promise: Promise<unknown>) => {
        const error = await errorOf(promise);
        return error instanceof ForbiddenError || error instanceof ConflictError
          ? error.errorCode
          : String(error);
      };
      const everything = ['orders.read', 'reports.read'];
      expect(
        await codeOf(asCaller('a1', everything, () => replace(['role-staff', 'role-super_admin']))),
      ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);

      holding('super_admin', 'user');
      otherSuperAdmins = ['u2'];
      expect(await codeOf(asCaller('u1', 'root', () => replace(['role-user'])))).toBe(
        APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN,
      );
      otherSuperAdmins = [];
      expect(await codeOf(asCaller('root', 'root', () => replace(['role-user'])))).toBe(
        APP_ERROR_CODES.CONFLICT,
      );
      expect([given, revoked]).toEqual([[], []]);

      otherSuperAdmins = ['u2'];
      await asCaller('root', 'root', () => replace(['role-user']));
      expect(revoked).toEqual(['ur-super_admin']);
    });

    it('a user who is gone is a 404', async () => {
      userRoles.isLiveUser = () => Promise.resolve(false);
      expect(await errorOf(inTx(() => replace([])))).toBeInstanceOf(NotFoundError);
    });
  });

  describe('replaceUserGrants (D72, D74)', () => {
    const PAST = nowInstant().subtract({ hours: 1 });
    const LATER = nowInstant().add({ hours: 1 });
    const CATALOG = new Map(
      [
        ['p-read', 'orders.read'],
        ['p-create', 'orders.create'],
        ['p-delete', 'orders.delete'],
        ['p-reports', 'reports.read'],
      ].map(([id, key]) => [id, { id, key, retiredAt: null }]),
    );
    let created: { permissionId: string; expiresAt: unknown; note: unknown }[];
    let updated: [string, unknown][];
    let revoked: string[];
    const asCaller = <T>(held: string[] | 'root', fn: () => Promise<T>) =>
      runWithRequestContext(
        {
          requestId: 'r1',
          locale: 'en',
          clientIp: 'unknown',
          actor: 'user:a1',
          user: { id: 'a1' },
          permissions: () =>
            Promise.resolve(
              held === 'root'
                ? { superAdmin: true, permissions: [] }
                : { superAdmin: false, permissions: held },
            ),
        },
        () => inTx(fn),
      );
    const replace = (grants: GrantItem[]) => service().replaceUserGrants('u1', grants);
    const keys = (items: { key: string }[]) => items.map(({ key }) => key);
    const ALL = ['orders.read', 'orders.create', 'orders.delete', 'reports.read'];

    beforeEach(() => {
      created = [];
      updated = [];
      revoked = [];
      // orders.read (no end), reports.read (expired, with a note), orders.delete.
      userPermissions.findGrantsOf = () =>
        Promise.resolve([
          {
            grant: { id: 'g-read', expiresAt: null, note: null },
            permission: CATALOG.get('p-read'),
          },
          {
            grant: { id: 'g-reports', expiresAt: PAST, note: 'audit' },
            permission: CATALOG.get('p-reports'),
          },
          {
            grant: { id: 'g-delete', expiresAt: null, note: null },
            permission: CATALOG.get('p-delete'),
          },
        ]);
      permissions.findGrantableByIds = (ids: string[]) =>
        Promise.resolve(ids.flatMap((id) => CATALOG.get(id) ?? []));
      userPermissions.create = (input: (typeof created)[number]) => {
        created.push(input);
        return Promise.resolve({});
      };
      userPermissions.updateById = (id: string, patch: unknown) => {
        updated.push([id, patch]);
        return Promise.resolve({});
      };
      userPermissions.softDeleteById = (id: string) => {
        revoked.push(id);
        return Promise.resolve({});
      };
    });

    it('grants, updates, revokes and keeps — an expired grant sent back as it is stays unchanged', async () => {
      const change = await asCaller(ALL, () =>
        replace([
          { permissionId: 'p-read', note: 'on call' },
          { permissionId: 'p-reports', expiresAt: PAST, note: 'audit' },
          { permissionId: 'p-create', expiresAt: LATER },
        ]),
      );
      expect(created).toEqual([
        { userId: 'u1', permissionId: 'p-create', expiresAt: LATER, note: null } as never,
      ]);
      expect(updated).toEqual([['g-read', { expiresAt: null, note: 'on call' }]]);
      expect(revoked).toEqual(['g-delete']);
      expect(memory.deleted).toEqual(['rbac:permissions:u1']);
      expect([
        keys(change.added),
        keys(change.updated),
        keys(change.removed),
        keys(change.unchanged),
      ]).toEqual([['orders.create'], ['orders.read'], ['orders.delete'], ['reports.read']]);
    });

    it('the same set writes nothing and drops no cache; a grant sent without its note loses it', async () => {
      await asCaller([], () =>
        replace([
          { permissionId: 'p-read' },
          { permissionId: 'p-reports', expiresAt: PAST, note: 'audit' },
          { permissionId: 'p-delete', expiresAt: null, note: null },
        ]),
      );
      expect([created, updated, revoked, memory.deleted]).toEqual([[], [], [], []]);

      // reports.read sent without expiry and note: both cleared, which is a change to check.
      await asCaller(ALL, () =>
        replace([
          { permissionId: 'p-read' },
          { permissionId: 'p-reports' },
          { permissionId: 'p-delete' },
        ]),
      );
      expect(updated).toEqual([['g-reports', { expiresAt: null, note: null }]]);
    });

    it('400 for a permission that cannot be given or an expiry not in the future, before any write', async () => {
      const unknown = await errorOf(
        asCaller('root', () => replace([{ permissionId: 'p-read' }, { permissionId: 'p-gone' }])),
      );
      expect(unknown).toBeInstanceOf(ValidationError);
      expect((unknown as ValidationError).details.map(({ field }) => field)).toEqual([
        'grants.1.permissionId',
      ]);
      const expired = await errorOf(
        asCaller('root', () => replace([{ permissionId: 'p-create', expiresAt: PAST }])),
      );
      expect((expired as ValidationError).details.map(({ field }) => field)).toEqual([
        'grants.0.expiresAt',
      ]);
      expect([created, updated, revoked]).toEqual([[], [], []]);
    });

    it('the caller must hold every permission granted, updated or revoked: one 403 naming all', async () => {
      const error = await errorOf(
        asCaller(['reports.read'], () =>
          replace([
            { permissionId: 'p-read', note: 'changed' },
            { permissionId: 'p-reports', expiresAt: PAST, note: 'audit' },
            { permissionId: 'p-create' },
          ]),
        ),
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).details.map(({ field }) => field)).toEqual([
        'orders.create',
        'orders.read',
        'orders.delete',
      ]);
      expect([created, updated, revoked, memory.deleted]).toEqual([[], [], [], []]);
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
