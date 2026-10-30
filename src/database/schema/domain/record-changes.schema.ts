import { sql } from 'drizzle-orm';
import { check, index, jsonb, primaryKey, text } from 'drizzle-orm/pg-core';
import { instant, NOW, sequentialId } from '../columns';
import { appTable } from '../schemas';

/** What happened to the audited row (D16). INSERTs are not recorded: the row itself is the record. */
export const RECORD_CHANGE_ACTIONS = ['UPDATE', 'SOFT_DELETE', 'RESTORE', 'DELETE'] as const;
export type RecordChangeAction = (typeof RECORD_CHANGE_ACTIONS)[number];

/**
 * Keyed by database column name. UPDATE, SOFT_DELETE, RESTORE: `{ "<column>": { "from", "to" } }`
 * for the changed columns only. DELETE: the full row as it was (`{ "<column>": value }`).
 * Redacted columns hold `"[REDACTED]"`.
 */
export type RecordChangeSet = Record<string, unknown>;

/**
 * Generic audit trail (D16): one row per UPDATE / soft delete / restore / hard delete,
 * written by `AuditedRepository` in the same transaction as the change itself — a rolled-back
 * change leaves no audit row, and a committed one cannot skip it.
 *
 * Partition-ready: the primary key holds `changed_at`, and there are no foreign keys or other
 * unique constraints (the audited row may be deleted; partitioned tables need the partition key
 * in every unique index).
 */
export const recordChanges = appTable(
  'record_changes',
  {
    id: sequentialId(),
    changedAt: instant('changed_at').notNull().default(NOW),
    tableName: text('table_name').notNull(),
    recordId: text('record_id').notNull(),
    action: text('action', { enum: RECORD_CHANGE_ACTIONS }).notNull(),
    changes: jsonb('changes').$type<RecordChangeSet>().notNull(),
    actor: text('actor').notNull(),
    requestId: text('request_id'),
    /**
     * Header of a detail row (`ChildRepository`): the history of a header and all
     * its details — also hard-deleted ones — is one indexed query. Both set or both null.
     */
    parentTable: text('parent_table'),
    parentId: text('parent_id'),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.changedAt] }),
    index('record_changes_lookup_idx').on(table.tableName, table.recordId, table.changedAt.desc()),
    index('record_changes_parent_idx')
      .on(table.parentTable, table.parentId, table.changedAt.desc())
      .where(sql`${sql.identifier('parent_id')} is not null`),
    // Unqualified column, literal list: a CHECK may only reference its own row.
    check(
      'record_changes_action_check',
      sql`${sql.identifier('action')} in ('UPDATE', 'SOFT_DELETE', 'RESTORE', 'DELETE')`,
    ),
    check(
      'record_changes_parent_check',
      sql`(${sql.identifier('parent_table')} is null) = (${sql.identifier('parent_id')} is null)`,
    ),
  ],
);

export type RecordChange = typeof recordChanges.$inferSelect;
