import { and, eq, gt, isNull, or, type SQL } from 'drizzle-orm';
import type { Temporal } from 'temporal-polyfill';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { permissions, userPermissions, type UserPermission } from '../../database/schema';
import { NOW } from '../../database/schema/columns';
import { rbacScope } from './rbac-scope.util';

/** A permission a user holds on its own, and until when (`null` = no end). */
export interface ActiveGrant {
  key: string;
  expiresAt: Temporal.Instant | null;
}

/**
 * Extra permissions given to one user (D51: additive only, optional `expires_at` + note; own `id`,
 * soft delete = revocation, audited), through `rbacScope()` (D56).
 */
export class RbacUserPermissionsRepository extends BaseRepository<typeof userPermissions> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(userPermissions, txHost);
  }

  protected override scoped(...conditions: (SQL | undefined)[]): SQL | undefined {
    return super.scoped(rbacScope(userPermissions), ...conditions);
  }

  /** The live grant of `permissionId` to `userId`, expired or not. */
  async findLive(userId: string, permissionId: string): Promise<UserPermission | null> {
    const rows = await this.txHost.tx
      .select()
      .from(userPermissions)
      .where(
        this.scoped(
          eq(userPermissions.userId, userId),
          eq(userPermissions.permissionId, permissionId),
        ),
      )
      .limit(1);
    return rows.at(0) ?? null;
  }

  /** Grants of `userId` that count now: live, not expired (database clock), permission not retired. */
  async findActiveGrants(userId: string): Promise<ActiveGrant[]> {
    return this.txHost.tx
      .select({ key: permissions.key, expiresAt: userPermissions.expiresAt })
      .from(userPermissions)
      .innerJoin(
        permissions,
        and(
          eq(permissions.id, userPermissions.permissionId),
          isNull(permissions.deletedAt),
          isNull(permissions.retiredAt),
        ),
      )
      .where(
        this.scoped(
          eq(userPermissions.userId, userId),
          or(isNull(userPermissions.expiresAt), gt(userPermissions.expiresAt, NOW)),
        ),
      );
  }
}

export const rbacUserPermissionsRepository = new RbacUserPermissionsRepository();
