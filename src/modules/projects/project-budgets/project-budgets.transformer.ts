import type { ProjectBudget } from '../../../database/schema';
import type { ProjectBudgetResponse } from './project-budgets.dto';

export const toProjectBudgetResponse = (entity: ProjectBudget): ProjectBudgetResponse => ({
  id: entity.id,
  projectId: entity.projectId,
  name: entity.name,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});
