import { eq } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { users, type User } from '../../database/schema';

/**
 * Users: a standalone table. Reads, paging, create, audited update / soft delete / restore come
 * from BaseRepository; this class adds only the lookups the domain needs.
 */
export class UsersRepository extends BaseRepository<typeof users> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    // The password hash never reaches record_changes (a change is still recorded).
    super(users, txHost, { redact: ['passwordHash'] });
  }

  /** The live user with this email, if any. */
  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.txHost.tx
      .select()
      .from(users)
      .where(this.scoped(eq(users.email, email)))
      .limit(1);
    return rows.at(0) ?? null;
  }
}

export const usersRepository = new UsersRepository();
