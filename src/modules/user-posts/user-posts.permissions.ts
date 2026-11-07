import { permission, type PermissionDefinition } from '../../core/security/rbac';

/** The API permissions of the user-posts module (D47), collected in `src/permissions.ts`: read only. */
export const USER_POST_PERMISSIONS: readonly PermissionDefinition[] = [
  permission('user-posts', 'read', "Read users' external posts"),
];
