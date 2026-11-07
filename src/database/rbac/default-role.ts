import { and, eq, isNull } from 'drizzle-orm';
import { InternalServerError } from '../../core/errors';
import { USER_ROLE } from '../../core/security/rbac';
import { BaseRepository } from '../base.repository';
import { roles, userRoles } from '../schema';
import { defaultTxHost, type TransactionHost } from '../transaction-host';

/**
 * Gives a new user the system role `user` (D59: no permission until an administrator maps some).
 * One place for every way a user is created — by an administrator (`users`) or by public sign-up
 * (`auth`) — joining the caller's transaction; written through BaseRepository (actor stamps).
 */
export class DefaultRoleRepository extends BaseRepository<typeof userRoles> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(userRoles, txHost);
  }

  async assign(userId: string): Promise<void> {
    const rows = await this.txHost.tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.key, USER_ROLE), isNull(roles.deletedAt)))
      .limit(1);
    const roleId = rows.at(0)?.id;
    // Migration 0010 and every permission sync (`bun run db:migrate`) create it.
    if (roleId === undefined) throw new InternalServerError('The system role "user" is missing');
    await this.create({ userId, roleId });
  }
}

export const defaultRoleRepository = new DefaultRoleRepository();
