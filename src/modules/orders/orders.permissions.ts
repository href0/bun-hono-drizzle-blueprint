import { crudPermissions, type PermissionDefinition } from '../../core/security/rbac';

/** The API permissions of the orders module (D47), collected in `src/permissions.ts`. */
export const ORDER_PERMISSIONS: readonly PermissionDefinition[] = crudPermissions(
  'orders',
  'orders (with their items)',
);
