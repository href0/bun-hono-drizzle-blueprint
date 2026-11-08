import { and, asc, eq, isNull } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import {
  permissions,
  rolePermissions,
  type Permission,
  type RolePermission,
} from '../../database/schema';

/** Which permissions a role holds (D65: own `id`, soft delete = unmapping, audited). Global (D56). */
export class RbacRolePermissionsRepository extends BaseRepository<typeof rolePermissions> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(rolePermissions, txHost);
  }

  /** The live mapping of `permissionId` to `roleId`, if any. */
  async findLive(roleId: string, permissionId: string): Promise<RolePermission | null> {
    const rows = await this.txHost.tx
      .select()
      .from(rolePermissions)
      .where(
        this.scoped(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, permissionId),
        ),
      )
      .limit(1);
    return rows.at(0) ?? null;
  }

  /**
   * The live mappings of `roleId` with their permission, by key — retired permissions included (an
   * admin sees them), deleted ones not: their mappings wait for a restore of the permission.
   */
  async findMappingsOf(
    roleId: string,
  ): Promise<{ mapping: RolePermission; permission: Permission }[]> {
    return this.txHost.tx
      .select({ mapping: rolePermissions, permission: permissions })
      .from(rolePermissions)
      .innerJoin(
        permissions,
        and(eq(permissions.id, rolePermissions.permissionId), isNull(permissions.deletedAt)),
      )
      .where(this.scoped(eq(rolePermissions.roleId, roleId)))
      .orderBy(asc(permissions.key));
  }
}

export const rbacRolePermissionsRepository = new RbacRolePermissionsRepository();
