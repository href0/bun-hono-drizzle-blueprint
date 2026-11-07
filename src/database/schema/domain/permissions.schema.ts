import { sql } from 'drizzle-orm';
import { check, varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  instant,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';

/**
 * RBAC permission (D47, D48). `source = 'api'`: an action checked by routes (`orders.read`),
 * created and kept in step by the permission registry sync, never changed through the API;
 * `source = 'menu'`: created by an administrator for the frontend, key prefixed `menu.` (E1).
 * An API permission that left the registry is not deleted: `retired_at` is set and it no longer
 * counts (E4).
 */
export const permissions = appTable(
  'permissions',
  {
    id: uuidPrimaryKey(),
    /** `<module>.<action>` for `api`, `menu.<name>` for `menu`. */
    key: varchar('key', { length: 100 }).notNull(),
    label: varchar('label', { length: 150 }).notNull(),
    /** Grouping for the admin screen (usually the module name). */
    groupName: varchar('group_name', { length: 100 }).notNull(),
    source: varchar('source', { length: 10 }).notNull(),
    retiredAt: instant('retired_at'),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [
    activeUniqueIndex('permissions_key_active_uq', [table.key], table.deletedAt),
    // Unqualified columns, literal list: a CHECK may only reference its own row.
    check('permissions_source_check', sql`${sql.identifier('source')} in ('api', 'menu')`),
    check(
      'permissions_menu_prefix_check',
      sql`(${sql.identifier('source')} = 'menu') = (${sql.identifier('key')} like 'menu.%')`,
    ),
  ],
);

export type Permission = typeof permissions.$inferSelect;
