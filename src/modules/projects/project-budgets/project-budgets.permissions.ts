import { definePermissions } from '../../../core/security/rbac';

/**
 * The API permissions of the project-budgets module (D47). A 1:1 dependent is saved with one upsert
 * (`PUT /projects/:projectId/budget`), so it has no separate `create`: writing the budget is `update`.
 */
export const PROJECT_BUDGET_PERMISSIONS = definePermissions('project-budgets', {
  read: 'Read project budgets',
  update: 'Save project budgets',
  delete: 'Delete project budgets',
  restore: 'Restore project budgets',
});
