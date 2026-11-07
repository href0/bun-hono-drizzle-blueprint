import { crudPermissions } from '../../core/security/rbac';

/** The API permissions of the users module (D47): routes check `USER_PERMISSIONS.<action>`. */
export const USER_PERMISSIONS = crudPermissions('users', 'users');
