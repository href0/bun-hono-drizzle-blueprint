import { eq } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { users, type User } from '../../database/schema';

/**
 * The `users` table as the auth module needs it: lookups for login / refresh / profile and the
 * public registration insert. Modules may not import each other (dependency-cruiser), so auth
 * has its own repository over the shared table; writes still go through `BaseRepository`
 * (actor stamps, audit), exactly like `UsersRepository`.
 */
export class AuthUsersRepository extends BaseRepository<typeof users> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(users, txHost, { redact: ['passwordHash'] });
  }

  /** The live (not soft-deleted) user with this email, if any — active or not. */
  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.txHost.tx
      .select()
      .from(users)
      .where(this.scoped(eq(users.email, email)))
      .limit(1);
    return rows.at(0) ?? null;
  }
}

export const authUsersRepository = new AuthUsersRepository();
