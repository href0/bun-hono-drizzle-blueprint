import { and, count, desc, eq, exists, getTableColumns, isNotNull, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getActor } from '../core/context/request-context';
import { InternalServerError, NotFoundError } from '../core/errors';
import { AuditedRepository, type AuditOptions, type AuditParent } from './audited.repository';
import {
  MANAGED_COLUMNS,
  withoutManagedColumns,
  type BaseTable,
  type PageQuery,
} from './base.repository';
import { NOW } from './schema/columns';
import { defaultTxHost, type TransactionHost } from './transaction-host';

type Row<TTable extends PgTable> = TTable['$inferSelect'];

/** Values from callers: never the managed columns; the parent reference is ignored (no re-parenting). */
export type DependentInput<TTable extends PgTable> = Partial<
  Omit<TTable['$inferSelect'], (typeof MANAGED_COLUMNS)[number]>
>;

/** Result of `upsertForParent`: the row and whether it was created (201) or updated (200). */
export interface UpsertResult<TRow> {
  row: TRow;
  created: boolean;
}

type ParentLock = 'share' | 'update';

/**
 * Repository base for dependent tables (plan D33): rows with their own pages and soft delete that
 * always belong to one parent (a standalone / header table) through `parentReference()`.
 *
 * - **Reads** see a row only when it is live and its parent is live and inside `parentScope()`
 *   (`EXISTS` on the parent): deleting the parent hides its children without touching them, and
 *   restoring the parent brings back the children that were live.
 * - **Writes** lock the visible parent first (`FOR SHARE`; `FOR UPDATE` for a 1:1 upsert), then the
 *   row (`FOR UPDATE`) — one lock order, as in `ChildRepository` — and call
 *   `assertParentWritable(parent)`. A parent that is missing, deleted or outside the scope is
 *   `NotFoundError` for parent-scoped calls and `null` for id-based ones: the service answers 404
 *   either way, so another owner's data is never confirmed to exist.
 * - The parent reference cannot change through input. Updates, soft deletes and restores are
 *   audited with the parent in `parent_table` / `parent_id`; creating is not (the row is the record).
 */
export abstract class DependentRepository<
  TTable extends BaseTable,
  TParent extends BaseTable,
> extends AuditedRepository<TTable> {
  private readonly parentKey: string;

  protected constructor(
    table: TTable,
    private readonly parent: TParent,
    /** The column referencing the parent (`parentReference(...)`). */
    private readonly parentColumn: PgColumn,
    txHost: TransactionHost = defaultTxHost,
    audit: AuditOptions<Row<TTable>> = {},
  ) {
    super(table, txHost, audit);
    const key = Object.entries(getTableColumns(table)).find(
      ([, column]) => column === parentColumn,
    )?.[0];
    if (!key) {
      throw new InternalServerError(`${this.tableName}: parentColumn is not a column of the table`);
    }
    this.parentKey = key;
  }

  /**
   * Extra conditions on the parent table that every read and write must satisfy — typically
   * ownership (`eq(projects.ownerId, …)`). A parent outside the scope is treated as missing.
   * Default: no extra condition.
   */
  protected parentScope(): SQL | undefined {
    return undefined;
  }

  /**
   * Called with the locked parent before every write; throw (e.g. `ConflictError`) to refuse it,
   * e.g. while the parent's status no longer allows changes. Default: always writable.
   */
  protected assertParentWritable(_parent: Row<TParent>): void | Promise<void> {
    return undefined;
  }

  /** Live rows whose parent is live and in scope, plus the given conditions. */
  protected scoped(...conditions: (SQL | undefined)[]): SQL | undefined {
    const parent: PgTable = this.parent;
    return and(
      isNull(this.table.deletedAt),
      exists(
        this.txHost.tx
          .select({ one: sql`1` })
          .from(parent)
          .where(and(eq(this.parent.id, this.parentColumn), this.visibleParent())),
      ),
      ...conditions,
    );
  }

  // ---- reads ----------------------------------------------------------------------------------

  /** `null` when the row is missing or deleted, or its parent is missing, deleted or out of scope. */
  async findById(id: string): Promise<Row<TTable> | null> {
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .select()
      .from(table)
      .where(this.scoped(eq(this.table.id, id)))
      .limit(1);
    return rows.at(0) ?? null;
  }

  /** A page of the parent's live rows (default newest first). The parent must be visible. */
  async findPageForParent(
    parentId: string,
    { page, perPage, orderBy }: PageQuery,
  ): Promise<Row<TTable>[]> {
    await this.requireVisibleParent(parentId);
    const table: PgTable = this.table;
    return this.txHost.tx
      .select()
      .from(table)
      .where(this.scoped(eq(this.parentColumn, parentId)))
      .orderBy(...(orderBy ?? [desc(this.table.createdAt), desc(this.table.id)]))
      .limit(perPage)
      .offset((page - 1) * perPage);
  }

  async countForParent(parentId: string): Promise<number> {
    await this.requireVisibleParent(parentId);
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .select({ total: count() })
      .from(table)
      .where(this.scoped(eq(this.parentColumn, parentId)));
    return rows.at(0)?.total ?? 0;
  }

  /** 1:1 tables: the parent's live row, `null` when it has none. The parent must be visible. */
  async findOneForParent(parentId: string): Promise<Row<TTable> | null> {
    await this.requireVisibleParent(parentId);
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .select()
      .from(table)
      .where(this.scoped(eq(this.parentColumn, parentId)))
      .limit(1);
    return rows.at(0) ?? null;
  }

  // ---- writes ---------------------------------------------------------------------------------

  /** Inserts a row under the parent, stamped with the actor. */
  async createForParent(parentId: string, input: DependentInput<TTable>): Promise<Row<TTable>> {
    return this.inTransaction(async () => {
      const parent = await this.lockParent(parentId, 'share');
      if (!parent) throw new NotFoundError();
      await this.assertParentWritable(parent);
      return this.insertRow(parentId, input);
    });
  }

  /**
   * 1:1 tables: creates the parent's row or updates its live one. The parent is locked
   * `FOR UPDATE`, so concurrent upserts of one parent queue instead of racing; the
   * `activeUniqueIndex` on the parent column is the last line.
   */
  async upsertForParent(
    parentId: string,
    input: DependentInput<TTable>,
  ): Promise<UpsertResult<Row<TTable>>> {
    return this.inTransaction(async () => {
      const parent = await this.lockParent(parentId, 'update');
      if (!parent) throw new NotFoundError();
      await this.assertParentWritable(parent);

      const before = (await this.lockWhere(this.liveOfParent(parentId))).at(0);
      if (!before) return { row: await this.insertRow(parentId, input), created: true };
      return { row: await this.updateRow(parentId, before, input), created: false };
    });
  }

  /** Lock → diff → update → audit; the row unchanged when nothing changes, `null` when not visible. */
  async updateById(id: string, patch: DependentInput<TTable>): Promise<Row<TTable> | null> {
    return this.inTransaction(async () => {
      const locked = await this.lockRowUnderParent(id, false);
      if (!locked) return null;
      return this.updateRow(locked.parentId, locked.row, patch);
    });
  }

  /** `deleted_at = now()`; `null` when the row or its parent is not visible. */
  async softDeleteById(id: string): Promise<Row<TTable> | null> {
    return this.inTransaction(async () => {
      const locked = await this.lockRowUnderParent(id, false);
      if (!locked) return null;
      return this.softDeleteRow(locked.parentId, locked.row);
    });
  }

  /** 1:1 tables: soft-deletes the parent's live row; `null` when it has none. */
  async softDeleteForParent(parentId: string): Promise<Row<TTable> | null> {
    return this.inTransaction(async () => {
      const parent = await this.lockParent(parentId, 'share');
      if (!parent) throw new NotFoundError();
      await this.assertParentWritable(parent);

      const before = (await this.lockWhere(this.liveOfParent(parentId))).at(0);
      if (!before) return null;
      return this.softDeleteRow(parentId, before);
    });
  }

  /**
   * Brings a soft-deleted row back; `null` when it is not deleted or its parent is not visible.
   * On a 1:1 table a live row of the same parent makes this a unique violation (409 in the service).
   */
  async restoreById(id: string): Promise<Row<TTable> | null> {
    return this.inTransaction(async () => {
      const locked = await this.lockRowUnderParent(id, true);
      if (!locked) return null;

      const restored = await this.writeRow(this.idOf(locked.row), { deletedAt: null });
      await this.writeChange(
        'RESTORE',
        this.idOf(locked.row),
        this.diff(locked.row, { deletedAt: null }),
        this.parentRef(locked.parentId),
      );
      return restored;
    });
  }

  // -------------------------------------------------------------------------------------------

  private visibleParent(): SQL | undefined {
    return and(isNull(this.parent.deletedAt), this.parentScope());
  }

  private liveOfParent(parentId: string): SQL | undefined {
    return and(eq(this.parentColumn, parentId), isNull(this.table.deletedAt));
  }

  private idOf(row: Row<TTable>): string {
    return String((row as { id: unknown }).id);
  }

  private parentRef(parentId: string): AuditParent {
    return { table: this.parent, id: parentId };
  }

  private async requireVisibleParent(parentId: string): Promise<void> {
    const parent: PgTable = this.parent;
    const rows = await this.txHost.tx
      .select({ id: this.parent.id })
      .from(parent)
      .where(and(eq(this.parent.id, parentId), this.visibleParent()));
    if (rows.length === 0) throw new NotFoundError();
  }

  /** The visible parent, locked; `null` when missing, deleted or out of scope. */
  private async lockParent(parentId: string, mode: ParentLock): Promise<Row<TParent> | null> {
    const parent: PgTable = this.parent;
    const rows: Row<TParent>[] = await this.txHost.tx
      .select()
      .from(parent)
      .where(and(eq(this.parent.id, parentId), this.visibleParent()))
      .for(mode);
    return rows.at(0) ?? null;
  }

  /**
   * Locks the row's visible parent, then the row (live, or deleted when `deleted`), in that order.
   * The parent id is read first without a lock: it never changes, so it cannot go stale.
   */
  private async lockRowUnderParent(
    id: string,
    deleted: boolean,
  ): Promise<{ row: Row<TTable>; parentId: string } | null> {
    const table: PgTable = this.table;
    const ref = (
      await this.txHost.tx
        .select({ parentId: this.parentColumn })
        .from(table)
        .where(eq(this.table.id, id))
        .limit(1)
    ).at(0);
    if (!ref) return null;

    const parentId = String(ref.parentId);
    const parent = await this.lockParent(parentId, 'share');
    if (!parent) return null;
    await this.assertParentWritable(parent);

    const row = (
      await this.lockWhere(
        and(
          eq(this.table.id, id),
          deleted ? isNotNull(this.table.deletedAt) : isNull(this.table.deletedAt),
        ),
      )
    ).at(0);
    return row ? { row, parentId } : null;
  }

  private async insertRow(parentId: string, input: object): Promise<Row<TTable>> {
    const actor = getActor();
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .insert(table)
      .values({
        ...this.callerValues(input),
        [this.parentKey]: parentId,
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

  /** Returns `before` itself when nothing changed (no write, no audit). */
  private async updateRow(
    parentId: string,
    before: Row<TTable>,
    patch: object,
  ): Promise<Row<TTable>> {
    const values = this.callerValues(patch);
    const changes = this.diff(before, values);
    if (Object.keys(changes).length === 0) return before;

    const id = this.idOf(before);
    const updated = await this.writeRow(id, values);
    await this.writeChange('UPDATE', id, changes, this.parentRef(parentId));
    return updated;
  }

  private async softDeleteRow(parentId: string, before: Row<TTable>): Promise<Row<TTable>> {
    const id = this.idOf(before);
    const deleted = await this.writeRow(id, { deletedAt: NOW });
    await this.writeChange(
      'SOFT_DELETE',
      id,
      this.diff(before, { deletedAt: deleted.deletedAt }),
      this.parentRef(parentId),
    );
    return deleted;
  }

  /** UPDATE by id with `updated_at = now()` and `updated_by = actor`, returning the new row. */
  private async writeRow(id: string, values: Record<string, unknown>): Promise<Row<TTable>> {
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

  /** Caller input without managed columns and without the parent reference (no re-parenting). */
  private callerValues(input: object): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(withoutManagedColumns(input)).filter(([key]) => key !== this.parentKey),
    );
  }
}
