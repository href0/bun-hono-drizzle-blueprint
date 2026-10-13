import { budgetsRepository, BudgetsRepository } from './budgets.repository';
import { ConflictError, NotFoundError } from '../../../core/errors';
import { isUniqueViolation, type UpsertResult } from '../../../database';
import type { SaveBudgetDto } from './budgets.dto';
import { budgetMissingMessage, budgetNotFoundMessage, BUDGET_MESSAGES } from './budgets.messages';
import type { Budget } from '../../../database/schema';

export class BudgetsService {
  constructor(private readonly repository: BudgetsRepository = budgetsRepository) {}

  async getBudget(projectId: string): Promise<Budget> {
    const record = await this.repository.findOneForParent(projectId);
    if (!record) throw new NotFoundError(budgetMissingMessage(projectId));
    return record;
  }

  /** Creates the project's budget or updates the live one. */
  async saveBudget(projectId: string, dto: SaveBudgetDto): Promise<UpsertResult<Budget>> {
    return this.repository.upsertForParent(projectId, { ...dto });
  }

  async deleteBudget(projectId: string): Promise<void> {
    const deleted = await this.repository.softDeleteForParent(projectId);
    if (!deleted) throw new NotFoundError(budgetMissingMessage(projectId));
  }

  async getBudgetById(id: string): Promise<Budget> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(budgetNotFoundMessage(id));
    return record;
  }

  async restoreBudget(id: string): Promise<Budget> {
    try {
      const restored = await this.repository.restoreById(id);
      if (!restored) throw new NotFoundError(budgetNotFoundMessage(id));
      return restored;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(BUDGET_MESSAGES.ALREADY_EXISTS);
      throw error;
    }
  }
}

export const budgetsService = new BudgetsService();
