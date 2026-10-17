import { asyncHandler, getValidatedBody, getValidatedParams } from '../../../core/middlewares';
import { ApiResponse } from '../../../core/response';
import { projectBudgetsService, ProjectBudgetsService } from './project-budgets.service';
import { toProjectBudgetResponse } from './project-budgets.transformer';
import type { UuidParamDto } from '../../../core/dto/common.dto';
import type { ProjectBudgetParentParamDto, SaveProjectBudgetDto } from './project-budgets.dto';
import { PROJECT_BUDGET_MESSAGES } from './project-budgets.messages';

export class ProjectBudgetsController {
  constructor(private readonly service: ProjectBudgetsService = projectBudgetsService) {}

  getForParent = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<ProjectBudgetParentParamDto>(c);
    const record = await this.service.getProjectBudget(projectId);

    return new ApiResponse(toProjectBudgetResponse(record), PROJECT_BUDGET_MESSAGES.RETRIEVED, 200);
  });

  save = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<ProjectBudgetParentParamDto>(c);
    const dto = getValidatedBody<SaveProjectBudgetDto>(c);
    const { row, created } = await this.service.saveProjectBudget(projectId, dto);

    return created
      ? new ApiResponse(toProjectBudgetResponse(row), PROJECT_BUDGET_MESSAGES.CREATED, 201)
      : new ApiResponse(toProjectBudgetResponse(row), PROJECT_BUDGET_MESSAGES.UPDATED, 200);
  });

  removeForParent = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<ProjectBudgetParentParamDto>(c);
    await this.service.deleteProjectBudget(projectId);

    return new ApiResponse(null, PROJECT_BUDGET_MESSAGES.DELETED, 200);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.getProjectBudgetById(param.id);

    return new ApiResponse(toProjectBudgetResponse(record), PROJECT_BUDGET_MESSAGES.RETRIEVED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restoreProjectBudget(param.id);

    return new ApiResponse(
      toProjectBudgetResponse(restored),
      PROJECT_BUDGET_MESSAGES.RESTORED,
      200,
    );
  });
}

export const projectBudgetsController = new ProjectBudgetsController();
