import { crudPermissions, type PermissionDefinition } from '../../../core/security/rbac';

/** The API permissions of the project-tasks module (D47), collected in `src/permissions.ts`. */
export const PROJECT_TASK_PERMISSIONS: readonly PermissionDefinition[] = crudPermissions(
  'project-tasks',
  'project tasks',
);
