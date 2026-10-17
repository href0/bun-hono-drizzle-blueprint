import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../../core/middlewares';
import { ApiResponse } from '../../../core/response';
import { projectTasksService, ProjectTasksService } from './project-tasks.service';
import { toProjectTaskResponse, toProjectTaskListResponse } from './project-tasks.transformer';
import type { PaginationQueryDto, UuidParamDto } from '../../../core/dto/common.dto';
import type {
  CreateProjectTaskDto,
  ProjectTaskParentParamDto,
  UpdateProjectTaskDto,
} from './project-tasks.dto';
import { PROJECT_TASK_MESSAGES } from './project-tasks.messages';

export class ProjectTasksController {
  constructor(private readonly service: ProjectTasksService = projectTasksService) {}

  create = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<ProjectTaskParentParamDto>(c);
    const dto = getValidatedBody<CreateProjectTaskDto>(c);
    const created = await this.service.createProjectTask(projectId, dto);

    return new ApiResponse(toProjectTaskResponse(created), PROJECT_TASK_MESSAGES.CREATED, 201);
  });

  list = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<ProjectTaskParentParamDto>(c);
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { records, total } = await this.service.listProjectTasks(projectId, query);
    const totalPages = Math.ceil(total / query.perPage) || 1;

    return new ApiResponse(
      toProjectTaskListResponse(records),
      PROJECT_TASK_MESSAGES.LIST_RETRIEVED,
      200,
      {
        currentPage: query.page,
        perPage: query.perPage,
        totalItems: total,
        totalPages,
      },
    );
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.getProjectTaskById(param.id);

    return new ApiResponse(toProjectTaskResponse(record), PROJECT_TASK_MESSAGES.RETRIEVED, 200);
  });

  update = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const dto = getValidatedBody<UpdateProjectTaskDto>(c);
    const updated = await this.service.updateProjectTask(param.id, dto);

    return new ApiResponse(toProjectTaskResponse(updated), PROJECT_TASK_MESSAGES.UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteProjectTask(param.id);

    return new ApiResponse(null, PROJECT_TASK_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restoreProjectTask(param.id);

    return new ApiResponse(toProjectTaskResponse(restored), PROJECT_TASK_MESSAGES.RESTORED, 200);
  });
}

export const projectTasksController = new ProjectTasksController();
