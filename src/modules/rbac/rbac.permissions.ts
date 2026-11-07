import { crudPermissions, definePermissions } from '../../core/security/rbac';

/** Roles and the permissions mapped to them (plan RBAC step 6a): routes check `ROLE_PERMISSIONS.<action>`. */
export const ROLE_PERMISSIONS = crudPermissions('roles', 'roles and their permissions');

/** Permissions: reading every one with its endpoints; writing only menu permissions (E1). */
export const PERMISSION_PERMISSIONS = definePermissions('permissions', {
  read: 'Read permissions and the endpoints they open',
  create: 'Create menu permissions',
  update: 'Update menu permissions',
  delete: 'Delete menu permissions',
  restore: 'Restore menu permissions',
});
