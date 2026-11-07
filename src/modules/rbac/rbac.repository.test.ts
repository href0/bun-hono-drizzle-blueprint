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

  it('role permissions: the live mapping of a role and a permission', async () => {
    expect(
      await new RbacRolePermissionsRepository(recorder.txHost).findLive('r1', 'p1'),
    ).toBeNull();
    expect(lastSql()).toContain('"role_permissions"."deleted_at" is null');
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
