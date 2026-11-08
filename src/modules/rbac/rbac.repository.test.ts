import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import { RbacPermissionsRepository } from './rbac-permissions.repository';
import { RbacRolePermissionsRepository } from './rbac-role-permissions.repository';
import { RbacRolesRepository } from './rbac-roles.repository';
import { RbacUserPermissionsRepository } from './rbac-user-permissions.repository';
import { RbacUserRolesRepository } from './rbac-user-roles.repository';
import { rbacScope } from './rbac-scope.util';
import { roles } from '../../database/schema';

/**
 * The SQL the RBAC repositories send (hermetic). What it returns on PostgreSQL — multi-role,
 * expiry, revocation, retired permissions — is proven by test/integration/rbac.int.ts.
 */
describe('RBAC repositories (SQL shape)', () => {
  const recorder = createSqlRecorder();
  const lastSql = (): string => recorder.statements.at(-1)?.sql ?? '';

  beforeEach(() => {
    recorder.reset();
  });

  it('rbacScope adds nothing until tenancy (D56)', () => {
    expect(rbacScope(roles)).toBeUndefined();
  });

  it('roles: reads only live rows', async () => {
    expect(await new RbacRolesRepository(recorder.txHost).findById('r1')).toBeNull();
    expect(lastSql()).toContain('"roles"."deleted_at" is null');
  });

  it('permissions: only live, unretired ones can be given', async () => {
    expect(await new RbacPermissionsRepository(recorder.txHost).findGrantableById('p1')).toBeNull();
    expect(lastSql()).toContain('"permissions"."retired_at" is null');
    expect(lastSql()).toContain('"permissions"."deleted_at" is null');
  });

  it('roles: the list of GET /roles — live rows, is_system filter, total under the same filter', async () => {
    const repository = new RbacRolesRepository(recorder.txHost);
    const query = { page: 1, perPage: 10, sort: [], isSystem: true } as never;
    expect(await repository.findRoleList(query)).toEqual({ rows: [], total: 0 });
    for (const statement of recorder.statements.map(({ sql }) => sql)) {
      expect(statement).toContain('"roles"."is_system" = ');
      expect(statement).toContain('"roles"."deleted_at" is null');
    }
    await repository.findRoleList({ page: 1, perPage: 10, sort: [] });
    expect(lastSql()).not.toContain('is_system');
  });

  it('permissions: list filters, a row whatever its state, mapped to a role, counting, holders', async () => {
    const repository = new RbacPermissionsRepository(recorder.txHost);
    await repository.findPermissionList({
      page: 1,
      perPage: 10,
      sort: [],
      source: 'menu',
      group: 'menus',
      retired: true,
    } as never);
    for (const filter of [
      '"permissions"."source" = ',
      '"permissions"."group_name" = ',
      '"permissions"."retired_at" is not null',
    ]) {
      expect(lastSql()).toContain(filter);
    }
    await repository.findPermissionList({
      page: 1,
      perPage: 10,
      sort: [],
      retired: false,
    });
    expect(lastSql()).toContain('"permissions"."retired_at" is null');
    await repository.findPermissionList({ page: 1, perPage: 10, sort: [] });
    expect(lastSql()).not.toContain('retired_at');

    expect(await repository.findIncludingDeleted('p1')).toBeNull();
    expect(lastSql()).not.toContain('deleted_at" is null');

    expect(await repository.findMappedToRole('r1')).toEqual([]);
    expect(lastSql()).toContain('"role_permissions"."deleted_at" is null');
    expect(lastSql()).toContain('"permissions"."deleted_at" is null');

    expect(await repository.findCounting()).toEqual([]);
    expect(lastSql()).toContain('"permissions"."retired_at" is null');

    recorder.respondWith([['u1']], [['u1'], ['u2']]);
    expect(await repository.findHolderIds('p1')).toEqual(['u1', 'u2']);
    const [throughRoles, throughGrants] = recorder.statements.slice(-2).map(({ sql }) => sql);
    expect(throughRoles).toContain('"user_roles"."deleted_at" is null');
    expect(throughRoles).toContain('"roles"."deleted_at" is null');
    expect(throughGrants).toContain('"user_permissions"."expires_at" > now()');
  });

  it('role permissions: the live mapping of a role and a permission', async () => {
    expect(
      await new RbacRolePermissionsRepository(recorder.txHost).findLive('r1', 'p1'),
    ).toBeNull();
    expect(lastSql()).toContain('"role_permissions"."deleted_at" is null');
  });

  it('replace (D72): the live mappings of a role with live permissions; grantable among many ids', async () => {
    expect(await new RbacRolePermissionsRepository(recorder.txHost).findMappingsOf('r1')).toEqual(
      [],
    );
    expect(lastSql()).toContain('"role_permissions"."deleted_at" is null');
    // Deleted permissions are left out (their mappings wait for a restore); retired ones are not.
    expect(lastSql()).toContain('"permissions"."deleted_at" is null');
    expect(lastSql()).not.toContain('retired_at" is null');

    const permissions = new RbacPermissionsRepository(recorder.txHost);
    recorder.reset();
    expect(await permissions.findGrantableByIds([])).toEqual([]);
    expect(recorder.statements).toEqual([]);
    expect(await permissions.findGrantableByIds(['p1', 'p2'])).toEqual([]);
    expect(lastSql()).toContain('"permissions"."id" in (');
    expect(lastSql()).toContain('"permissions"."retired_at" is null');
    expect(lastSql()).toContain('"permissions"."deleted_at" is null');
  });

  it('user roles: live assignment, holders, live user, role keys and permissions through roles', async () => {
    const repository = new RbacUserRolesRepository(recorder.txHost);
    expect(await repository.findLive('u1', 'r1')).toBeNull();
    expect(lastSql()).toContain('"user_roles"."deleted_at" is null');

    recorder.respondWith([['u1'], ['u2']]);
    expect(await repository.findHolderIds('r1')).toEqual(['u1', 'u2']);
    expect(lastSql()).toStartWith('select distinct');

    recorder.respondWith([['u1']]);
    expect(await repository.isLiveUser('u1')).toBe(true);
    expect(lastSql()).toContain('"users"."deleted_at" is null');

    recorder.respondWith([['super_admin']]);
    expect(await repository.findRoleKeys('u1')).toEqual(['super_admin']);
    expect(lastSql()).toContain('"roles"."deleted_at" is null');

    recorder.respondWith([['orders.read']]);
    expect(await repository.findRolePermissionKeys('u1')).toEqual(['orders.read']);
    for (const filter of [
      '"roles"."deleted_at" is null',
      '"role_permissions"."deleted_at" is null',
      '"permissions"."retired_at" is null',
      '"user_roles"."deleted_at" is null',
    ]) {
      expect(lastSql()).toContain(filter);
    }
  });

  it('user access (D68): roles of a user, grants with their permission', async () => {
    const userRolesRepo = new RbacUserRolesRepository(recorder.txHost);
    expect(await userRolesRepo.findRolesOf('u1')).toEqual([]);
    expect(lastSql()).toContain('"roles"."deleted_at" is null');
    expect(lastSql()).toContain('"user_roles"."deleted_at" is null');

    expect(await new RbacUserPermissionsRepository(recorder.txHost).findGrantsOf('u1')).toEqual([]);
    expect(lastSql()).toContain('"user_permissions"."deleted_at" is null');
    expect(lastSql()).toContain('"permissions"."deleted_at" is null');
  });

  it('user permissions: live grant, and grants that count now (database clock)', async () => {
    const repository = new RbacUserPermissionsRepository(recorder.txHost);
    expect(await repository.findLive('u1', 'p1')).toBeNull();
    expect(lastSql()).toContain('"user_permissions"."deleted_at" is null');

    recorder.respondWith([['orders.read', null]]);
    expect(await repository.findActiveGrants('u1')).toEqual([
      { key: 'orders.read', expiresAt: null },
    ]);
    expect(lastSql()).toContain('"user_permissions"."expires_at" > now()');
    expect(lastSql()).toContain('"permissions"."retired_at" is null');
  });
});
