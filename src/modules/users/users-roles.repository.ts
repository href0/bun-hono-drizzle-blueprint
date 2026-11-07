import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { roles, userRoles } from '../../database/schema';

/**
 * The roles of users as this module shows them (D58): the role keys in a user's response. Role
 * management is the RBAC module's; modules share the table, never each other's code (R03).
 */
export class UsersRolesRepository extends BaseRepository<typeof userRoles> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(userRoles, txHost);
  }

  /** The live role keys of each user (only live roles), sorted; users without a role are absent. */
  async findRoleKeys(userIds: readonly string[]): Promise<Map<string, string[]>> {
    const keys = new Map<string, string[]>();
    if (userIds.length === 0) return keys;
    const rows = await this.txHost.tx
      .select({ userId: userRoles.userId, key: roles.key })
      .from(userRoles)
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
      .where(this.scoped(inArray(userRoles.userId, [...userIds])))
      .orderBy(asc(roles.key));
    for (const row of rows) keys.set(row.userId, [...(keys.get(row.userId) ?? []), row.key]);
    return keys;
  }
}

export const usersRolesRepository = new UsersRolesRepository();
