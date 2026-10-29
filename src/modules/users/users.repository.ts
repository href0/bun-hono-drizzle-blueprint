import { and, eq } from 'drizzle-orm';
import {
  BaseRepository,
  defaultTxHost,
  instantRange,
  type ListColumns,
  type TransactionHost,
} from '../../database';
import { users, type User } from '../../database/schema';
import type { UserListQueryDto, UserSortField } from './users.dto';

/** The allowlist of `GET /users` (D41): sortable fields → columns, and the columns `q` searches. */
const USER_LIST_COLUMNS: ListColumns<UserSortField> = {
  sort: {
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    email: users.email,
    fullName: users.fullName,
  },
  search: [users.email, users.fullName],
};

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

  /** A page of live users for `GET /users` and the total under the same filters. */
  async findUserList(query: UserListQueryDto): Promise<{ rows: User[]; total: number }> {
    return this.findList(
      query,
      USER_LIST_COLUMNS,
      and(
        query.role === undefined ? undefined : eq(users.role, query.role),
        query.isActive === undefined ? undefined : eq(users.isActive, query.isActive),
        instantRange(users.createdAt, query.createdFrom, query.createdTo),
      ),
    );
  }
}

export const usersRepository = new UsersRepository();
