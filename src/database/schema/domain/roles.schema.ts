import { boolean, varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';

/**
 * RBAC role (D46–D61): a named set of permissions given to users through `user_roles`.
 * System roles (`is_system`: `super_admin`, `user`) are created by the migration and cannot be
 * deleted; `super_admin` has no `role_permissions` rows — it holds every permission (D52).
 * Ready for tenancy (D56): a nullable `tenant_id` (NULL = system role) is added later.
 */
export const roles = appTable(
  'roles',
  {
    id: uuidPrimaryKey(),
    /** Stable code used by code and seeds (`super_admin`, `finance_staff`). */
    key: varchar('key', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [activeUniqueIndex('roles_key_active_uq', [table.key], table.deletedAt)],
);

export type Role = typeof roles.$inferSelect;
