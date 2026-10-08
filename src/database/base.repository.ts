import { and, count, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getActor } from '../core/context/request-context';
import { InternalServerError } from '../core/errors';
import { AuditedRepository, type AuditedTable, type AuditOptions } from './audited.repository';
import { NOW } from './schema/columns';
import { defaultTxHost, type TransactionHost } from './transaction-host';

/**
 * A standalone ("mandiri") or header table: `uuidPrimaryKey()` + `timestamps()` +
 * `auditColumns()` + `softDelete()` (see references/database.md).
 */
export type BaseTable = AuditedTable & {
  createdAt: PgColumn;
  updatedAt: PgColumn;
  createdBy: PgColumn;
  updatedBy: PgColumn;
  deletedAt: PgColumn;
};

/** Columns the repository fills itself; values passed for them by callers are ignored. */
export const MANAGED_COLUMNS = [
  'id',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'deletedAt',
] as const;
type ManagedColumn = (typeof MANAGED_COLUMNS)[number];

/** Insert values without the managed columns (`id` may still be given, e.g. by imports). */
export type CreateInput<TTable extends PgTable> = Omit<
  TTable['$inferInsert'],
  Exclude<ManagedColumn, 'id'>
>;

/** Changeable columns only. */
export type UpdatePatch<TTable extends PgTable> = Partial<
  Omit<TTable['$inferSelect'], ManagedColumn>
>;

export interface PageQuery {
  page: number;
  perPage: number;
  /** Default `created_at DESC, id DESC` — always ends with a unique column, so pages are stable. */
  orderBy?: SQL[];
}

/** Drops managed columns and `undefined` members ("not set") from caller input. */
export const withoutManagedColumns = (input: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        value !== undefined && !(MANAGED_COLUMNS as readonly string[]).includes(key),
    ),
  );

/**
 * Repository base for standalone and header tables (plan step 2.5).
 *
 * - Soft-deleted rows are invisible: every read goes through `scoped()` (`deleted_at IS NULL`).
 * - `created_by` / `updated_by` come from the request actor; callers cannot set them.
 * - Updates, soft deletes and restores lock the row, write only what changed with
 *   `updated_at = now()` (database clock) and append the change to `record_changes` in the same
 *   transaction. There is no hard delete.
 */
export abstract class BaseRepository<TTable extends BaseTable> extends AuditedRepository<TTable> {
  protected constructor(
    table: TTable,
    txHost: TransactionHost = defaultTxHost,
    audit: AuditOptions<TTable['$inferSelect']> = {},
  ) {
    super(table, txHost, audit);
  }

  /** `deleted_at IS NULL` and the given conditions. */
  protected scoped(...conditions: (SQL | undefined)[]): SQL | undefined {
    return and(isNull(this.table.deletedAt), ...conditions);
  }

  async findById(id: string): Promise<TTable['$inferSelect'] | null> {
    // Widened: Drizzle's select typing cannot resolve a generic table parameter.
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .select()
      .from(table)
      .where(this.scoped(eq(this.table.id, id)))
      .limit(1);
    return rows.at(0) ?? null;
  }

  async findPage({ page, perPage, orderBy }: PageQuery): Promise<TTable['$inferSelect'][]> {
    const table: PgTable = this.table;
    return this.txHost.tx
      .select()
      .from(table)
      .where(this.scoped())
      .orderBy(...(orderBy ?? [desc(this.table.createdAt), desc(this.table.id)]))
      .limit(perPage)
      .offset((page - 1) * perPage);
  }

  async count(): Promise<number> {
    const table: PgTable = this.table;
    const rows = await this.txHost.tx.select({ total: count() }).from(table).where(this.scoped());
    return rows.at(0)?.total ?? 0;
  }

  /** Inserts a row stamped with the current actor. Not audited: the row itself is the record. */
  async create(input: CreateInput<TTable>): Promise<TTable['$inferSelect']> {
    const actor = getActor();
    const id = (input as { id?: unknown }).id;
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .insert(table)
      .values({
        ...withoutManagedColumns(input),
        ...(typeof id === 'string' ? { id } : {}),
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();
    const created = rows.at(0);
    if (!created) {
      throw new InternalServerError(`INSERT INTO ${this.tableName} returned no rows`);
    }
    return created;
  }

  /**
   * Applies `patch` to a live row: lock → diff → update → audit. Returns the row unchanged (no
   * write, no audit) when nothing changes, `null` when the row does not exist or is soft-deleted.
   */
  async updateById(id: string, patch: UpdatePatch<TTable>): Promise<TTable['$inferSelect'] | null> {
    return this.inTransaction(async () => {
      const before = await this.lockById(id);
      if (!before || this.isDeleted(before)) return null;

      const values = withoutManagedColumns(patch);
      const changes = this.diff(before, values);
      if (Object.keys(changes).length === 0) return before;

      const updated = await this.writeRow(id, values);
      await this.writeChange('UPDATE', id, changes);
      return updated;
    });
  }

  /** Hides a live row (`deleted_at = now()`); `null` when it does not exist or is already deleted. */
  async softDeleteById(id: string): Promise<TTable['$inferSelect'] | null> {
    return this.inTransaction(async () => {
      const before = await this.lockById(id);
      if (!before || this.isDeleted(before)) return null;

      const deleted = await this.writeRow(id, { deletedAt: NOW });
      await this.writeChange(
        'SOFT_DELETE',
        id,
        this.diff(before, { deletedAt: deleted.deletedAt }),
      );
      return deleted;
    });
  }

  /** Brings a soft-deleted row back; `null` when it does not exist or is not deleted. */
  async restoreById(id: string): Promise<TTable['$inferSelect'] | null> {
    return this.inTransaction(async () => {
      const before = (
        await this.lockWhere(and(eq(this.table.id, id), isNotNull(this.table.deletedAt)))
      ).at(0);
      if (!before) return null;

      const restored = await this.writeRow(id, { deletedAt: null });
      await this.writeChange('RESTORE', id, this.diff(before, { deletedAt: null }));
      return restored;
    });
  }

  private isDeleted(row: TTable['$inferSelect']): boolean {
    return (row as { deletedAt?: unknown }).deletedAt != null;
  }

  /** UPDATE by id with `updated_at = now()` and `updated_by = actor`, returning the new row. */
  private async writeRow(
    id: string,
    values: Record<string, unknown>,
  ): Promise<TTable['$inferSelect']> {
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .update(table)
      .set({ ...values, updatedAt: NOW, updatedBy: getActor() })
      .where(eq(this.table.id, id))
      .returning();
    const updated = rows.at(0);
    if (!updated) {
      throw new InternalServerError(`UPDATE ${this.tableName} returned no rows for a locked row`);
    }
    return updated;
  }
}
