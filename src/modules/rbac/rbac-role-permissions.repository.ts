import { eq } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { rolePermissions, type RolePermission } from '../../database/schema';

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
}

export const rbacRolePermissionsRepository = new RbacRolePermissionsRepository();
