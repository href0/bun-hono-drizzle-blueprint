import { crudPermissions, type PermissionDefinition } from '../../../core/security/rbac';

/** The API permissions of the project-budgets module (D47), collected in `src/permissions.ts`. */
export const PROJECT_BUDGET_PERMISSIONS: readonly PermissionDefinition[] = crudPermissions(
  'project-budgets',
  'project budgets',
);
