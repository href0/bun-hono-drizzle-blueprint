import { eq, getTableColumns, getTableName } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getActor, getRequestContext } from '../core/context/request-context';
import { InternalServerError } from '../core/errors';
import { diffRecords, snapshotRecord } from '../utils/record-diff.util';
import { recordChanges, type RecordChangeAction, type RecordChangeSet } from './schema';
import { defaultTxHost, TransactionHost, transactionStorage } from './transaction-host';

/** A table with a single-column `id` key (`uuidPrimaryKey()`). */
export type AuditedTable = PgTable & { id: PgColumn };

/** The header a detail row belongs to, recorded with the detail's changes. */
export interface AuditParent {
  table: AuditedTable;
  id: string;
}

export interface AuditOptions<TRow> {
  /** Properties whose values never reach the audit trail (`[REDACTED]`), e.g. `passwordHash`. */
  redact?: readonly (keyof TRow & string)[];
}

/**
 * Bookkeeping columns left out of UPDATE diffs: the audit row itself records when (`changed_at`)
 * and by whom (`actor`).
 */
const NOT_DIFFED = ['updatedAt', 'updatedBy'];

/**
 * Base for repositories whose changes are audited in `record_changes` (plan D16). Provides the
 * primitives — `inTransaction`, `lockById`, `diff` / `snapshot`, `writeChange` — that
 * `BaseRepository` (plan step 2.5) composes into update / soft delete / restore / delete.
 *
 * Every primitive runs through `this.txHost.tx`. `lockById` and `writeChange` refuse to run
 * outside a transaction: the audit row must commit or roll back together with the change.
 */
export abstract class AuditedRepository<TTable extends AuditedTable> {
  private readonly columnNames: Record<string, string>;

  protected constructor(
    protected readonly table: TTable,
    protected readonly txHost: TransactionHost = defaultTxHost,
    private readonly audit: AuditOptions<TTable['$inferSelect']> = {},
  ) {
    this.columnNames = Object.fromEntries(
      Object.entries(getTableColumns(table)).map(([key, column]) => [key, column.name]),
    );
  }

  /** Runs `fn` in a transaction on this repository's connection, or joins the active one. */
  protected async inTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.txHost.run(fn);
  }

  /** `SELECT … FOR UPDATE` by id: the row as it is now, locked until the transaction ends. */
  protected async lockById(id: string): Promise<TTable['$inferSelect'] | null> {
    this.requireTransaction('lockById');
    // Widened: Drizzle's select typing cannot resolve a generic table parameter.
    const table: PgTable = this.table;
    const rows = await this.txHost.tx
      .select()
      .from(table)
      .where(eq(this.table.id, id))
      .for('update');
    return rows[0] ?? null;
  }

  /** Changed columns from `before` to `patch`, keyed by column name; `{}` when nothing changed. */
  protected diff(
    before: TTable['$inferSelect'],
    patch: Partial<TTable['$inferSelect']>,
  ): RecordChangeSet {
    return this.toColumnNames(
      diffRecords(before, patch, { redact: this.audit.redact, ignore: NOT_DIFFED }),
    );
  }

  /** The whole row keyed by column name, for a hard delete. */
  protected snapshot(record: TTable['$inferSelect']): RecordChangeSet {
    return this.toColumnNames(snapshotRecord(record, { redact: this.audit.redact }));
  }

  /**
   * Appends one audit row (actor and request id from the request context; `parent` for a detail
   * row, so its header's history includes it). An empty change set
   * writes nothing and returns `false`, so an update that changes nothing leaves no trace.
   */
  protected async writeChange(
    action: RecordChangeAction,
    recordId: string,
    changes: RecordChangeSet,
    parent?: AuditParent,
  ): Promise<boolean> {
    this.requireTransaction('writeChange');
    if (Object.keys(changes).length === 0) return false;
    await this.txHost.tx.insert(recordChanges).values({
      tableName: getTableName(this.table),
      recordId,
      action,
      changes,
      actor: getActor(),
      requestId: getRequestContext()?.requestId ?? null,
      parentTable: parent ? getTableName(parent.table) : null,
      parentId: parent?.id ?? null,
    });
    return true;
  }

  private toColumnNames(values: Record<string, unknown>): RecordChangeSet {
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [this.columnNames[key] ?? key, value]),
    );
  }

  private requireTransaction(operation: string): void {
    if (!transactionStorage.getStore()) {
      throw new InternalServerError(
        `${getTableName(this.table)}: ${operation}() must run inside a transaction (use inTransaction())`,
      );
    }
  }
}
