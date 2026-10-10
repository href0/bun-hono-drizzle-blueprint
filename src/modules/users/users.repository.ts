import { eq, sql } from 'drizzle-orm';
import { InternalServerError } from '../../core/errors';
import { TransactionHost, defaultTxHost } from '../../database/transaction-host';
import { users, type User, type NewUser } from '../../database/schema';

// eslint-disable-next-line no-restricted-syntax -- users has no audit/soft-delete columns yet; it moves to BaseRepository in plan step 2.8
export class UsersRepository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.txHost.tx.select().from(users).where(eq(users.id, id));
    return result[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.txHost.tx.select().from(users).where(eq(users.email, email));
    return result[0] ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const result = await this.txHost.tx.insert(users).values(data).returning();
    // Drizzle infers result[0] as User, but runtime INSERT RETURNING can be empty on DB-level
    // rejections (e.g., trigger-based row denial). Cast explicitly to reflect runtime reality.
    const created = result[0] as User | undefined;
    if (!created) {
      throw new InternalServerError(
        'INSERT INTO users returned no rows. This indicates an unexpected database-level rejection.',
      );
    }
    return created;
  }

  async findAll(limit: number, offset: number): Promise<User[]> {
    return this.txHost.tx.select().from(users).limit(limit).offset(offset);
  }

  async count(): Promise<number> {
    const result = await this.txHost.tx
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(users);
    return result[0]?.count ?? 0;
  }
}

export const usersRepository = new UsersRepository();
