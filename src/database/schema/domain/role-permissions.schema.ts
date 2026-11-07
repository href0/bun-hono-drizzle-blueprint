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
import { permissions } from './permissions.schema';
import { roles } from './roles.schema';

/**
 * Permission given to a role. Own `id` + soft delete like `user_roles` (E2): the audit trail is
 * per id and a removal stays recorded. Unchanged by tenancy (D56).
 */
export const rolePermissions = appTable(
  'role_permissions',
  {
    id: uuidPrimaryKey(),
    roleId: parentReference('role_id', () => roles.id),
    permissionId: parentReference('permission_id', () => permissions.id),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [
    activeUniqueIndex(
      'role_permissions_role_permission_active_uq',
      [table.roleId, table.permissionId],
      table.deletedAt,
    ),
    index('role_permissions_permission_idx').on(table.permissionId),
  ],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
