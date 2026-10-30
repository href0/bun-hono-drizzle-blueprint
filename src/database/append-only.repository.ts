import { count, desc, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ListQuery } from '../core/dto/list-query.dto';
import { InternalServerError } from '../core/errors';
import { listPage, type ListColumns } from './list-query';
import { defaultTxHost, type TransactionHost } from './transaction-host';

/** A record table (log / history): `sequentialPrimaryKey()` + `timestamps()`, in `APPEND_ONLY_TABLES`. */
export type AppendOnlyTable = PgTable & { id: PgColumn; createdAt: PgColumn };

/** Insert values without the columns the database fills (`id` identity, timestamps). */
export type AppendInput<TTable extends PgTable> = Omit<
  TTable['$inferInsert'],
  'id' | 'createdAt' | 'updatedAt'
>;

export interface RecordPageQuery {
  page: number;
  perPage: number;
  where?: SQL;
  /** Default `id DESC` — newest first (the identity follows insertion order). */
  orderBy?: SQL[];
}

/**
 * Repository base for record tables: rows are only ever appended and read —
 * there is no update or delete, and nothing to audit (the table is the record). Retention, if
 * any, is an operational job (partitions), not application code.
 */
export abstract class AppendOnlyRepository<TTable extends AppendOnlyTable> {
  protected constructor(
    protected readonly table: TTable,
    protected readonly txHost: TransactionHost = defaultTxHost,
  ) {}

  async append(input: AppendInput<TTable>): Promise<TTable['$inferSelect']> {
    // Widened: Drizzle's insert typing cannot resolve a generic table parameter.
    const table: PgTable = this.table;
    const rows = await this.txHost.tx.insert(table).values(input).returning();
    const created = rows.at(0);
    if (!created) {
      throw new InternalServerError('INSERT into an append-only table returned no rows');
    }
    return created;
  }

  async findPage({
    page,
    perPage,
    where,
    orderBy,
  }: RecordPageQuery): Promise<TTable['$inferSelect'][]> {
    const table: PgTable = this.table;
    return this.txHost.tx
      .select()
      .from(table)
      .where(where)
      .orderBy(...(orderBy ?? [desc(this.table.id)]))
      .limit(perPage)
      .offset((page - 1) * perPage);
  }

  async count(where?: SQL): Promise<number> {
    const table: PgTable = this.table;
    const rows = await this.txHost.tx.select({ total: count() }).from(table).where(where);
    return rows.at(0)?.total ?? 0;
  }

  /** A list query (D41): its page and its total under the same conditions. */
  async findList<TField extends string>(
    query: ListQuery<TField>,
    columns: ListColumns<TField>,
    where?: SQL,
  ): Promise<{ rows: TTable['$inferSelect'][]; total: number }> {
    return listPage({
      query,
      columns,
      id: this.table.id,
      where,
      page: (orderBy, condition) =>
        this.findPage({ page: query.page, perPage: query.perPage, orderBy, where: condition }),
      count: (condition) => this.count(condition),
    });
  }
}
