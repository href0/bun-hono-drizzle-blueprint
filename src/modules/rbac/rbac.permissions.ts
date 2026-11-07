import { crudPermissions, definePermissions } from '../../core/security/rbac';

/** Roles and the permissions mapped to them (plan RBAC step 6a): routes check `ROLE_PERMISSIONS.<action>`. */
export const ROLE_PERMISSIONS = crudPermissions('roles', 'roles and their permissions');

/** The roles of users (plan RBAC step 6b): giving one needs its permissions (no escalation). */
export const USER_ROLE_PERMISSIONS = definePermissions('user-roles', {
  read: 'Read the roles of users',
  create: 'Give roles to users',
  delete: 'Revoke roles from users',
});

/** Extra permissions of users (D51): granting or extending one needs it (no escalation). */
export const USER_PERMISSION_PERMISSIONS = definePermissions('user-permissions', {
  read: 'Read the extra permissions of users',
  create: 'Grant extra permissions to users and change their expiry',
  delete: 'Revoke extra permissions from users',
});

/** Permissions: reading every one with its endpoints; writing only menu permissions (E1). */
export const PERMISSION_PERMISSIONS = definePermissions('permissions', {
  read: 'Read permissions and the endpoints they open',
  create: 'Create menu permissions',
  update: 'Update menu permissions',
  delete: 'Delete menu permissions',
  restore: 'Restore menu permissions',
});
