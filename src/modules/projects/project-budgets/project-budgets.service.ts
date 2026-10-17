import { projectBudgetsRepository, ProjectBudgetsRepository } from './project-budgets.repository';
import { ConflictError, NotFoundError } from '../../../core/errors';
import { isUniqueViolation, type UpsertResult } from '../../../database';
import type { SaveProjectBudgetDto } from './project-budgets.dto';
import {
  projectBudgetMissingMessage,
  projectBudgetNotFoundMessage,
  PROJECT_BUDGET_MESSAGES,
} from './project-budgets.messages';
import type { ProjectBudget } from '../../../database/schema';

export class ProjectBudgetsService {
  constructor(private readonly repository: ProjectBudgetsRepository = projectBudgetsRepository) {}

  async getProjectBudget(projectId: string): Promise<ProjectBudget> {
    const record = await this.repository.findOneForParent(projectId);
    if (!record) throw new NotFoundError(projectBudgetMissingMessage(projectId));
    return record;
  }

  /** Creates the project's projectBudget or updates the live one. */
  async saveProjectBudget(
    projectId: string,
    dto: SaveProjectBudgetDto,
  ): Promise<UpsertResult<ProjectBudget>> {
    return this.repository.upsertForParent(projectId, { ...dto });
  }

  async deleteProjectBudget(projectId: string): Promise<void> {
    const deleted = await this.repository.softDeleteForParent(projectId);
    if (!deleted) throw new NotFoundError(projectBudgetMissingMessage(projectId));
  }

  async getProjectBudgetById(id: string): Promise<ProjectBudget> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(projectBudgetNotFoundMessage(id));
    return record;
  }

  async restoreProjectBudget(id: string): Promise<ProjectBudget> {
    try {
      const restored = await this.repository.restoreById(id);
      if (!restored) throw new NotFoundError(projectBudgetNotFoundMessage(id));
      return restored;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(PROJECT_BUDGET_MESSAGES.ALREADY_EXISTS);
      throw error;
    }
  }
}

export const projectBudgetsService = new ProjectBudgetsService();
