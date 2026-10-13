import { asyncHandler, getValidatedBody, getValidatedParams } from '../../../core/middlewares';
import { ApiResponse } from '../../../core/response';
import { budgetsService, BudgetsService } from './budgets.service';
import { toBudgetResponse } from './budgets.transformer';
import type { UuidParamDto } from '../../../core/dto/common.dto';
import type { BudgetParentParamDto, SaveBudgetDto } from './budgets.dto';
import { BUDGET_MESSAGES } from './budgets.messages';

export class BudgetsController {
  constructor(private readonly service: BudgetsService = budgetsService) {}

  getForParent = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<BudgetParentParamDto>(c);
    const record = await this.service.getBudget(projectId);

    return new ApiResponse(toBudgetResponse(record), BUDGET_MESSAGES.RETRIEVED, 200);
  });

  save = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<BudgetParentParamDto>(c);
    const dto = getValidatedBody<SaveBudgetDto>(c);
    const { row, created } = await this.service.saveBudget(projectId, dto);

    return created
      ? new ApiResponse(toBudgetResponse(row), BUDGET_MESSAGES.CREATED, 201)
      : new ApiResponse(toBudgetResponse(row), BUDGET_MESSAGES.UPDATED, 200);
  });

  removeForParent = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<BudgetParentParamDto>(c);
    await this.service.deleteBudget(projectId);

    return new ApiResponse(null, BUDGET_MESSAGES.DELETED, 200);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.getBudgetById(param.id);

    return new ApiResponse(toBudgetResponse(record), BUDGET_MESSAGES.RETRIEVED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restoreBudget(param.id);

    return new ApiResponse(toBudgetResponse(restored), BUDGET_MESSAGES.RESTORED, 200);
  });
}

export const budgetsController = new BudgetsController();
