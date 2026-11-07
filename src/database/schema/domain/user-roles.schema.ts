import { index } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  parentReference,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';
import { roles } from './roles.schema';
import { users } from './users.schema';

/**
 * Role given to a user; a user may hold several (D50). Own `id`, soft delete = revocation, unique
 * among live rows only (D55). Tenancy adds `tenant_id NOT NULL` without changing the key (D56).
 */
export const userRoles = appTable(
  'user_roles',
  {
    id: uuidPrimaryKey(),
    userId: parentReference('user_id', () => users.id),
    roleId: parentReference('role_id', () => roles.id),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [
    activeUniqueIndex(
      'user_roles_user_role_active_uq',
      [table.userId, table.roleId],
      table.deletedAt,
    ),
    index('user_roles_role_idx').on(table.roleId),
  ],
);

export type UserRole = typeof userRoles.$inferSelect;
