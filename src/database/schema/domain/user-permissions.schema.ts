import { index, varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  instant,
  parentReference,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';
import { permissions } from './permissions.schema';
import { users } from './users.schema';

/**
 * Extra permission given to one user on top of their roles — additive only, no per-user denial
 * (D51). Counts while live and not expired (`expires_at` null = no end). Own `id`, soft delete =
 * revocation (D55); tenancy adds `tenant_id NOT NULL` (D56).
 */
export const userPermissions = appTable(
  'user_permissions',
  {
    id: uuidPrimaryKey(),
    userId: parentReference('user_id', () => users.id),
    permissionId: parentReference('permission_id', () => permissions.id),
    expiresAt: instant('expires_at'),
    note: varchar('note', { length: 500 }),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [
    activeUniqueIndex(
      'user_permissions_user_permission_active_uq',
      [table.userId, table.permissionId],
      table.deletedAt,
    ),
    index('user_permissions_permission_idx').on(table.permissionId),
  ],
);

export type UserPermission = typeof userPermissions.$inferSelect;
