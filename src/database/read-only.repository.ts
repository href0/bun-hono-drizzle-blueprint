import { count, type SQL } from 'drizzle-orm';
import type { PgView } from 'drizzle-orm/pg-core';
import { defaultTxHost, type TransactionHost } from './transaction-host';

export interface ReferencePageQuery {
  page: number;
  perPage: number;
  where?: SQL;
  /** Required: a view has no key the repository could order by — end with a unique column. */
  orderBy: [SQL, ...SQL[]];
}

/**
 * Repository base for reference data owned by another system (plan step 2.5): a view declared
 * with `.existing()` — reads only. Writing is impossible twice over: the class has no write
 * method, and Drizzle refuses `insert` / `update` / `delete` on a view at compile time.
 */
export abstract class ReadOnlyRepository<TView extends PgView> {
  protected constructor(
    protected readonly view: TView,
    protected readonly txHost: TransactionHost = defaultTxHost,
  ) {}

  async findPage({
    page,
    perPage,
    where,
    orderBy,
  }: ReferencePageQuery): Promise<TView['$inferSelect'][]> {
    // Widened: Drizzle's select typing cannot resolve a generic view parameter.
    const view: PgView = this.view;
    const rows: unknown[] = await this.txHost.tx
      .select()
      .from(view)
      .where(where)
      .orderBy(...orderBy)
      .limit(perPage)
      .offset((page - 1) * perPage);
    return rows as TView['$inferSelect'][];
  }

  async count(where?: SQL): Promise<number> {
    const view: PgView = this.view;
    const rows = await this.txHost.tx.select({ total: count() }).from(view).where(where);
    return rows.at(0)?.total ?? 0;
  }
}
