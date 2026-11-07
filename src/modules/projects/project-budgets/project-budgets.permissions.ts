import { permission, type PermissionDefinition } from '../../../core/security/rbac';

const GROUP = 'project-budgets';

/**
 * The API permissions of the project-budgets module (D47), collected in `src/permissions.ts`. A 1:1
 * dependent is saved with one upsert (`PUT /projects/:projectId/budget`), so it has no separate
 * `create`: writing the budget is `update`.
 */
export const PROJECT_BUDGET_PERMISSIONS: readonly PermissionDefinition[] = [
  permission(GROUP, 'read', 'Read project budgets'),
  permission(GROUP, 'update', 'Save project budgets'),
  permission(GROUP, 'delete', 'Delete project budgets'),
  permission(GROUP, 'restore', 'Restore project budgets'),
];
