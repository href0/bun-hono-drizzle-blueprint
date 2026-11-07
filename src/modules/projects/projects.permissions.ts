import { crudPermissions, type PermissionDefinition } from '../../core/security/rbac';

/** The API permissions of the projects module (D47), collected in `src/permissions.ts`. */
export const PROJECT_PERMISSIONS: readonly PermissionDefinition[] = crudPermissions(
  'projects',
  'projects',
);
