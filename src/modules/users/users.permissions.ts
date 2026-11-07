import { crudPermissions, type PermissionDefinition } from '../../core/security/rbac';

/** The API permissions of the users module (D47), collected in `src/permissions.ts`. */
export const USER_PERMISSIONS: readonly PermissionDefinition[] = crudPermissions('users', 'users');
