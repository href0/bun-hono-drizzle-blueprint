import type { Budget } from '../../../database/schema';
import type { BudgetResponse } from './budgets.dto';

export const toBudgetResponse = (entity: Budget): BudgetResponse => ({
  id: entity.id,
  projectId: entity.projectId,
  name: entity.name,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});
