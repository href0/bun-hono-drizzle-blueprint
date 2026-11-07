import { and, eq, inArray, isNull } from 'drizzle-orm';
import { SUPER_ADMIN_ROLE } from '../../core/security/rbac';
import { BaseRepository } from '../base.repository';
import { roles, userRoles, users } from '../schema';
import { defaultTxHost, type TransactionHost } from '../transaction-host';

/**
 * The anti-lockout rule for `super_admin` (D52, plan RBAC steps 6b and 8b), in one place for every
 * way to lose one — revoking the role (`rbac`), deleting or deactivating the user (`users`).
 */
export class SuperAdminsRepository extends BaseRepository<typeof userRoles> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(userRoles, txHost);
  }

  /**
   * The live, active users other than `userId` who hold `super_admin`. Locks every live assignment
   * of the role first (`FOR UPDATE`, by id): two concurrent changes that would each remove one of
   * the last two wait for each other, and the second sees the first. Needs a transaction.
   */
  async lockOtherActiveHolders(userId: string): Promise<string[]> {
    const role = await this.txHost.tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.key, SUPER_ADMIN_ROLE), isNull(roles.deletedAt)))
      .limit(1);
    const roleId = role.at(0)?.id;
    if (roleId === undefined) return [];
    const holders = (await this.lockWhere(this.scoped(eq(userRoles.roleId, roleId))))
      .map((row) => row.userId)
      .filter((id) => id !== userId);
    if (holders.length === 0) return [];
    const active = await this.txHost.tx
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, holders), isNull(users.deletedAt), eq(users.isActive, true)));
    return active.map((row) => row.id);
  }
}

export const superAdminsRepository = new SuperAdminsRepository();
