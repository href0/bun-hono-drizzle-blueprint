import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
  type Role,
  type UserRole,
} from '../../database/schema';
import { rbacScope } from './rbac-scope.util';

/** Roles given to users (D50, D55: own `id`, soft delete = revocation, audited), through `rbacScope()` (D56). */
export class RbacUserRolesRepository extends BaseRepository<typeof userRoles> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(userRoles, txHost);
  }

  protected override scoped(...conditions: (SQL | undefined)[]): SQL | undefined {
    return super.scoped(rbacScope(userRoles), ...conditions);
  }

  /** The live role `roleId` of user `userId`, if any. */
  async findLive(userId: string, roleId: string): Promise<UserRole | null> {
    const rows = await this.txHost.tx
      .select()
      .from(userRoles)
      .where(this.scoped(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      .limit(1);
    return rows.at(0) ?? null;
  }

  /** Every user holding `roleId` now: whose cached permissions a change of that role touches. */
  async findHolderIds(roleId: string): Promise<string[]> {
    const rows = await this.txHost.tx
      .selectDistinct({ userId: userRoles.userId })
      .from(userRoles)
      .where(this.scoped(eq(userRoles.roleId, roleId)));
    return rows.map((row) => row.userId);
  }

  /** The live roles of `userId` through live assignments, by key. */
  async findRolesOf(userId: string): Promise<Role[]> {
    const rows = await this.txHost.tx
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(
        roles,
        and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt), rbacScope(roles)),
      )
      .where(this.scoped(eq(userRoles.userId, userId)))
      .orderBy(asc(roles.key));
    return rows.map((row) => row.role);
  }

  /**
   * The live assignments of `userId` with their live role, by key — a deleted role is left out: its
   * assignments wait for a restore of the role.
   */
  async findAssignmentsOf(userId: string): Promise<{ assignment: UserRole; role: Role }[]> {
    return this.txHost.tx
      .select({ assignment: userRoles, role: roles })
      .from(userRoles)
      .innerJoin(
        roles,
        and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt), rbacScope(roles)),
      )
      .where(this.scoped(eq(userRoles.userId, userId)))
      .orderBy(asc(roles.key));
  }

  /** Is `userId` a live user? Roles and permissions are given to live users only. */
  async isLiveUser(userId: string): Promise<boolean> {
    const rows = await this.txHost.tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  /** The live role keys of `userId` (only roles that are themselves live). */
  async findRoleKeys(userId: string): Promise<string[]> {
    const rows = await this.txHost.tx
      .selectDistinct({ key: roles.key })
      .from(userRoles)
      .innerJoin(
        roles,
        and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt), rbacScope(roles)),
      )
      .where(this.scoped(eq(userRoles.userId, userId)));
    return rows.map((row) => row.key);
  }

  /**
   * The permission keys `userId` holds through their live roles: live mappings to live permissions
   * that are not retired (D52, D67).
   */
  async findRolePermissionKeys(userId: string): Promise<string[]> {
    const rows = await this.txHost.tx
      .selectDistinct({ key: permissions.key })
      .from(userRoles)
      .innerJoin(
        roles,
        and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt), rbacScope(roles)),
      )
      .innerJoin(
        rolePermissions,
        and(eq(rolePermissions.roleId, roles.id), isNull(rolePermissions.deletedAt)),
      )
      .innerJoin(
        permissions,
        and(
          eq(permissions.id, rolePermissions.permissionId),
          isNull(permissions.deletedAt),
          isNull(permissions.retiredAt),
        ),
      )
      .where(this.scoped(eq(userRoles.userId, userId)));
    return rows.map((row) => row.key);
  }
}

export const rbacUserRolesRepository = new RbacUserRolesRepository();
