import { beforeEach, describe, expect, it } from 'bun:test';
import { runWithRequestContext, type RequestContext } from '../../core/context/request-context';
import { APP_ERROR_CODES, ApiError, ConflictError, NotFoundError } from '../../core/errors';
import type { EffectivePermissions } from '../../core/security/rbac';
import type { Permission, Role } from '../../database/schema';
import { runInFakeTransaction } from '../../database/transaction-host';
import type { RbacPermissionsRepository } from './rbac-permissions.repository';
import type { RbacRolePermissionsRepository } from './rbac-role-permissions.repository';
import type { RbacRolesRepository } from './rbac-roles.repository';
import { RbacRolesService } from './rbac-roles.service';
import type { RbacUserRolesRepository } from './rbac-user-roles.repository';
import type { RbacAccessService } from './rbac-access.service';
import type { RbacService } from './rbac.service';

const role = (key: string, isSystem = false): Role =>
  ({ id: `role-${key}`, key, isSystem }) as Role;
const permission = (key: string, retired = false): Permission =>
  ({ id: `perm-${key}`, key, source: 'api', retiredAt: retired ? {} : null }) as Permission;

/** Runs `fn` in a stand-in transaction that commits, as a signed-in user holding `effective`. */
const asUser = <T>(effective: EffectivePermissions, fn: () => Promise<T>): Promise<T> => {
  const context: RequestContext = {
    requestId: 'r1',
    locale: 'en',
    clientIp: 'unknown',
    actor: 'user:u1',
    user: { id: 'u1' },
    permissions: () => Promise.resolve(effective),
  };
  return runWithRequestContext(context, () => runInFakeTransaction({}, fn));
};
const inTx = <T>(fn: () => Promise<T>): Promise<T> => runInFakeTransaction({}, fn);

const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );
const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
  const error = await errorOf(promise);
  return error instanceof ApiError ? error.errorCode : undefined;
};

describe('RbacRolesService', () => {
  let roles: Record<string, unknown>;
  let permissions: Record<string, unknown>;
  let rolePermissions: Record<string, unknown>;
  let userRoles: Record<string, unknown>;
  let forgotten: string[][];
  let mapped: [string, string][];
  let unmapped: [string, string][];
  let created: Record<string, unknown>[];
  const service = () =>
    new RbacRolesService(
      roles as unknown as RbacRolesRepository,
      permissions as unknown as RbacPermissionsRepository,
      rolePermissions as unknown as RbacRolePermissionsRepository,
      userRoles as unknown as RbacUserRolesRepository,
      {
        forget: (ids: readonly string[]) => {
          forgotten.push([...ids]);
          return Promise.resolve();
        },
        mapPermission: (roleId: string, permissionId: string) => {
          mapped.push([roleId, permissionId]);
          return Promise.resolve({});
        },
        unmapPermission: (roleId: string, permissionId: string) => {
          unmapped.push([roleId, permissionId]);
          return Promise.resolve();
        },
      } as unknown as RbacService,
      {
        forget: (ids: readonly string[]) => {
          forgotten.push([...ids]);
          return Promise.resolve();
        },
        mapPermission: (roleId: string, permissionId: string) => {
          mapped.push([roleId, permissionId]);
          return Promise.resolve({});
        },
        unmapPermission: (roleId: string, permissionId: string) => {
          unmapped.push([roleId, permissionId]);
          return Promise.resolve();
        },
      } as unknown as RbacAccessService,
    );

  beforeEach(() => {
    forgotten = [];
    mapped = [];
    unmapped = [];
    created = [];
    roles = {
      findById: (id: string) =>
        Promise.resolve(
          id === 'missing' ? null : role(id.replace('role-', ''), id.includes('system')),
        ),
      findRoleList: () => Promise.resolve({ rows: [role('a')], total: 1 }),
      create: (input: Record<string, unknown>) => {
        created.push(input);
        return Promise.resolve({ id: 'role-new', ...input });
      },
      updateById: (id: string, patch: object) => Promise.resolve({ ...role('x'), id, ...patch }),
      softDeleteById: () => Promise.resolve({}),
      restoreById: (id: string) => Promise.resolve(role(id.replace('role-', ''))),
    };
    permissions = {
      findMappedToRole: () =>
        Promise.resolve([permission('orders.read'), permission('old.thing', true)]),
      findCounting: () => Promise.resolve([permission('orders.read'), permission('users.read')]),
    };
    rolePermissions = { findLive: () => Promise.resolve(null) };
    userRoles = { findHolderIds: () => Promise.resolve(['u1', 'u2']) };
  });

  it('lists and reads roles; an unknown role is a 404', async () => {
    expect(await service().listRoles({} as never)).toEqual({ roles: [role('a')], total: 1 });
    expect((await service().getRole('role-a')).key).toBe('a');
    expect(await errorOf(service().getRole('missing'))).toBeInstanceOf(NotFoundError);
  });

  it('creates a role that is never a system role; a taken key is a 409', async () => {
    const result = await inTx(() => service().createRole({ key: 'finance', name: 'Finance' }));
    expect(result.key).toBe('finance');
    expect(created).toEqual([
      { key: 'finance', name: 'Finance', description: null, isSystem: false },
    ]);

    roles.create = () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' }));
    expect(await errorOf(inTx(() => service().createRole({ key: 'x', name: 'X' })))).toBeInstanceOf(
      ConflictError,
    );
    roles.create = () => Promise.reject(new Error('boom'));
    expect(
      ((await errorOf(inTx(() => service().createRole({ key: 'x', name: 'X' })))) as Error).message,
    ).toBe('boom');
  });

  it('updates name and description; super_admin cannot be changed; a vanished row is a 404', async () => {
    expect((await inTx(() => service().updateRole('role-finance', { name: 'F' }))).name).toBe('F');
    expect(
      await errorOf(inTx(() => service().updateRole('role-super_admin', { name: 'Root' }))),
    ).toBeInstanceOf(ConflictError);
    roles.updateById = () => Promise.resolve(null);
    expect(await errorOf(inTx(() => service().updateRole('role-x', { name: 'F' })))).toBeInstanceOf(
      NotFoundError,
    );
  });

  it('deletes a role and drops the cached permissions of its holders; a system role stays', async () => {
    await inTx(() => service().deleteRole('role-finance'));
    expect(forgotten).toEqual([['u1', 'u2']]);

    expect(await errorOf(inTx(() => service().deleteRole('role-system')))).toBeInstanceOf(
      ConflictError,
    );
    roles.softDeleteById = () => Promise.resolve(null);
    expect(await errorOf(inTx(() => service().deleteRole('role-x')))).toBeInstanceOf(NotFoundError);
  });

  it('restores a role for a caller holding its (counting) permissions, and drops its holders’ cache', async () => {
    const restored = await asUser({ superAdmin: false, permissions: ['orders.read'] }, () =>
      service().restoreRole('role-finance'),
    );
    expect(restored.key).toBe('finance');
    expect(forgotten).toEqual([['u1', 'u2']]);
  });

  it('refuses a restore that would give the holders a permission the caller lacks (escalation)', async () => {
    expect(
      await codeOf(
        asUser({ superAdmin: false, permissions: [] }, () => service().restoreRole('role-finance')),
      ),
    ).toBe(APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN);
    expect(forgotten).toEqual([]);
  });

  it('a restore of a live or unknown role is a 404; a key taken meanwhile is a 409', async () => {
    roles.restoreById = () => Promise.resolve(null);
    expect(await errorOf(inTx(() => service().restoreRole('role-x')))).toBeInstanceOf(
      NotFoundError,
    );
    roles.restoreById = () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' }));
    expect(await errorOf(inTx(() => service().restoreRole('role-x')))).toBeInstanceOf(
      ConflictError,
    );
    roles.restoreById = () => Promise.reject(new Error('boom'));
    expect(((await errorOf(inTx(() => service().restoreRole('role-x')))) as Error).message).toBe(
      'boom',
    );
  });

  it('lists the permissions of a role; super_admin holds every permission that counts', async () => {
    const mappedList = await service().listRolePermissions('role-finance');
    expect(mappedList.map(({ key, endpoints }) => [key, endpoints])).toEqual([
      ['orders.read', []],
      ['old.thing', []],
    ]);
    const all = await service().listRolePermissions('role-super_admin');
    expect(all.map(({ key }) => key)).toEqual(['orders.read', 'users.read']);
  });

  it('PUT a permission: mapped through RbacAccessService (checks + escalation) once, idempotent after', async () => {
    expect(await inTx(() => service().putRolePermission('role-finance', 'perm-x'))).toEqual({
      created: true,
    });
    expect(mapped).toEqual([['role-finance', 'perm-x']]);

    rolePermissions.findLive = () => Promise.resolve({ id: 'rp1' });
    expect(await inTx(() => service().putRolePermission('role-finance', 'perm-x'))).toEqual({
      created: false,
    });
    expect(mapped).toHaveLength(1);
    expect(
      await errorOf(inTx(() => service().putRolePermission('missing', 'perm-x'))),
    ).toBeInstanceOf(NotFoundError);
  });

  it('DELETE a permission goes through RbacAccessService.unmapPermission', async () => {
    await inTx(() => service().deleteRolePermission('role-finance', 'perm-x'));
    expect(unmapped).toEqual([['role-finance', 'perm-x']]);
  });

  it('the role checklist: every live role by key, grantable when the caller holds all it gives (D73)', async () => {
    roles.findAllLive = () =>
      Promise.resolve([role('auditor'), role('empty'), role('staff'), role('super_admin', true)]);
    rolePermissions.findCountingKeysByRole = () =>
      Promise.resolve([
        { roleId: 'role-auditor', key: 'reports.read' },
        { roleId: 'role-staff', key: 'orders.read' },
        { roleId: 'role-staff', key: 'orders.update' },
      ]);
    const grantable = async (effective: EffectivePermissions) =>
      (await asUser(effective, () => service().listRoleOptions())).map(
        ({ role: { key }, grantable: may }) => [key, may],
      );

    expect(
      await grantable({ superAdmin: false, permissions: ['orders.read', 'orders.update'] }),
    ).toEqual([
      ['auditor', false],
      ['empty', true],
      ['staff', true],
      ['super_admin', false],
    ]);
    // One missing permission is enough to refuse the role.
    expect(await grantable({ superAdmin: false, permissions: ['orders.read'] })).toEqual([
      ['auditor', false],
      ['empty', true],
      ['staff', false],
      ['super_admin', false],
    ]);
    expect(await grantable({ superAdmin: true, permissions: [] })).toEqual([
      ['auditor', true],
      ['empty', true],
      ['staff', true],
      ['super_admin', true],
    ]);
  });
});
