import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getActor } from '../core/context/request-context';
import { BadRequestError, InternalServerError, NotFoundError } from '../core/errors';
import {
  AuditedRepository,
  type AuditedTable,
  type AuditOptions,
  type AuditParent,
} from './audited.repository';
import { withoutManagedColumns, type BaseTable } from './base.repository';
import { NOW } from './schema/columns';
import { defaultTxHost, type TransactionHost } from './transaction-host';

/**
 * A detail table: `uuidPrimaryKey()` + `parentReference()` (indexed) + `timestamps()` +
 * `auditColumns()`, no `softDelete()` — a detail lives and dies with its header.
 */
export type ChildTable = AuditedTable & {
  createdAt: PgColumn;
  updatedAt: PgColumn;
  createdBy: PgColumn;
  updatedBy: PgColumn;
};

type Row<TTable extends PgTable> = TTable['$inferSelect'];

/** Detail values from callers: never the id, the header reference or the managed columns. */
export type ChildInput<TChild extends PgTable> = Partial<Omit<Row<TChild>, 'id'>>;

/** One element of a full list saved at once (`syncForParent`): with `id` = keep/update, without = new. */
export type SyncItem<TChild extends PgTable> = ChildInput<TChild> & { id?: string };

/**
 * Repository base for detail rows. Every method takes the header id: a detail is
 * only reachable through its own header, so an id belonging to another header is "not found"
 * (no IDOR). Writes lock the live header first, then its details (one lock order for every
 * writer), touch the header's `updated_at`, and record each detail change in `record_changes`
 * with the header in `parent_table` / `parent_id`. Details are hard-deleted, with a snapshot.
 *
 * A missing or soft-deleted header is a `NotFoundError`. Override `assertParentWritable(header)` to
 * refuse writes by the header's state (e.g. a submitted order).
 */
export abstract class ChildRepository<
  TChild extends ChildTable,
  TParent extends BaseTable,
> extends AuditedRepository<TChild> {
  private readonly parentKey: string;

  protected constructor(
    table: TChild,
    private readonly parent: TParent,
    /** The detail column referencing the header (`parentReference(...)`). */
    private readonly parentColumn: PgColumn,
    txHost: TransactionHost = defaultTxHost,
    audit: AuditOptions<Row<TChild>> = {},
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
   * Called with the locked header before every write; throw (e.g. `ConflictError`) to refuse it,
   * e.g. while the header's status no longer allows changes. Default: always writable.
   */
  protected assertParentWritable(_parent: TParent['$inferSelect']): void | Promise<void> {
    return undefined;
  }

  /** The header's details, oldest first. */
  async findAllForParent(parentId: string): Promise<Row<TChild>[]> {
    await this.requireLiveParent(parentId, false);
    return this.selectWhere(this.ofParent(parentId));
  }

  /** One detail of the header; `null` when it does not exist or belongs to another header. */
  async findByIdForParent(parentId: string, id: string): Promise<Row<TChild> | null> {
    await this.requireLiveParent(parentId, false);
    return (await this.selectWhere(this.ofParent(parentId, id))).at(0) ?? null;
  }

  async createForParent(parentId: string, input: ChildInput<TChild>): Promise<Row<TChild>> {
    return this.inTransaction(async () => {
      await this.requireLiveParent(parentId, true);
      const created = await this.insertRow(parentId, input);
      await this.touchParent(parentId);
      return created;
    });
  }

  /** `null` when the detail does not exist under this header; unchanged row when nothing changes. */
  async updateForParent(
    parentId: string,
    id: string,
    patch: ChildInput<TChild>,
  ): Promise<Row<TChild> | null> {
    return this.inTransaction(async () => {
      await this.requireLiveParent(parentId, true);
      const before = (await this.lockWhere(this.ofParent(parentId, id))).at(0);
      if (!before) return null;

      const updated = await this.updateRow(parentId, before, patch);
      if (updated !== before) await this.touchParent(parentId);
      return updated;
    });
  }

  /** Hard delete with a snapshot in `record_changes`; `false` when not found under this header. */
  async deleteForParent(parentId: string, id: string): Promise<boolean> {
    return this.inTransaction(async () => {
      await this.requireLiveParent(parentId, true);
      const before = (await this.lockWhere(this.ofParent(parentId, id))).at(0);
      if (!before) return false;

      await this.deleteRow(parentId, before);
      await this.touchParent(parentId);
      return true;
    });
  }

  /**
   * Saves the header's complete list in one transaction (a form with rows): items with an `id`
   * are updated when they changed, items without one are inserted, existing details missing from
   * `items` are deleted. An `id` that is not a detail of this header is `NotFoundError`; the same
   * `id` twice is `BadRequestError`. Returns the resulting list.
   */
  async syncForParent(parentId: string, items: SyncItem<TChild>[]): Promise<Row<TChild>[]> {
    return this.inTransaction(async () => {
      await this.requireLiveParent(parentId, true);
      const existing = new Map(
        (await this.lockWhere(this.ofParent(parentId))).map((row) => [this.idOf(row), row]),
      );

      const keptIds = items.flatMap((item) => (item.id === undefined ? [] : [item.id]));
      if (new Set(keptIds).size !== keptIds.length) throw new BadRequestError();
      if (keptIds.some((id) => !existing.has(id))) throw new NotFoundError();

      let changed = false;
      for (const [id, row] of existing) {
        if (keptIds.includes(id)) continue;
        await this.deleteRow(parentId, row);
        changed = true;
      }
      for (const item of items) {
        const { id, ...values } = item;
        const before = id === undefined ? undefined : existing.get(id);
        if (before) {
          changed = (await this.updateRow(parentId, before, values)) !== before || changed;
        } else {
          await this.insertRow(parentId, values);
          changed = true;
        }
      }

      if (changed) await this.touchParent(parentId);
      return this.selectWhere(this.ofParent(parentId));
    });
  }

  // -------------------------------------------------------------------------------------------

  private ofParent(parentId: string, id?: string): SQL | undefined {
    return and(
      eq(this.parentColumn, parentId),
      id === undefined ? undefined : eq(this.table.id, id),
    );
  }

  private idOf(row: Row<TChild>): string {
    return String((row as { id: unknown }).id);
  }

  private parentRef(parentId: string): AuditParent {
    return { table: this.parent, id: parentId };
  }

  private async selectWhere(where: SQL | undefined): Promise<Row<TChild>[]> {
    // Widened: Drizzle's select typing cannot resolve a generic table parameter.
    const table: PgTable = this.table;
    return this.txHost.tx
      .select()
      .from(table)
      .where(where)
      .orderBy(asc(this.table.createdAt), asc(this.table.id));
  }

  /**
   * The header must exist and be live. With `lock` (writes) it is locked first (`FOR UPDATE`) and
   * passed to `assertParentWritable`.
   */
  private async requireLiveParent(parentId: string, lock: boolean): Promise<void> {
    const parent: PgTable = this.parent;
    const live = and(eq(this.parent.id, parentId), isNull(this.parent.deletedAt));
    if (!lock) {
      const rows = await this.txHost.tx.select({ id: this.parent.id }).from(parent).where(live);
      if (rows.length === 0) throw new NotFoundError();
      return;
    }
    const rows: TParent['$inferSelect'][] = await this.txHost.tx
      .select()
      .from(parent)
      .where(live)
      .for('update');
    const header = rows.at(0);
    if (!header) throw new NotFoundError();
    await this.assertParentWritable(header);
  }

  /** `updated_at = now()` on the header: a change of its details is a change of the header. */
  private async touchParent(parentId: string): Promise<void> {
    const parent: PgTable = this.parent;
    await this.txHost.tx
      .update(parent)
      .set({ updatedAt: NOW, updatedBy: getActor() })
      .where(eq(this.parent.id, parentId));
  }

  private async insertRow(parentId: string, input: object): Promise<Row<TChild>> {
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
    before: Row<TChild>,
    patch: object,
  ): Promise<Row<TChild>> {
    const values = this.callerValues(patch);
    const changes = this.diff(before, values);
    if (Object.keys(changes).length === 0) return before;

    const id = this.idOf(before);
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .update(table)
      .set({ ...values, updatedAt: NOW, updatedBy: getActor() })
      .where(eq(this.table.id, id))
      .returning();
    await this.writeChange('UPDATE', id, changes, this.parentRef(parentId));
    return rows.at(0) ?? before;
  }

  private async deleteRow(parentId: string, before: Row<TChild>): Promise<void> {
    const id = this.idOf(before);
    const table: PgTable = this.table;
    await this.txHost.tx.delete(table).where(eq(this.table.id, id));
    await this.writeChange('DELETE', id, this.snapshot(before), this.parentRef(parentId));
  }

  /** Caller input without managed columns and without the header reference (no re-parenting). */
  private callerValues(input: object): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(withoutManagedColumns(input)).filter(([key]) => key !== this.parentKey),
    );
  }
}
