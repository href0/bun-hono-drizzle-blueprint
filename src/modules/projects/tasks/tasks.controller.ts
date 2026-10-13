import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../../core/middlewares';
import { ApiResponse } from '../../../core/response';
import { tasksService, TasksService } from './tasks.service';
import { toTaskResponse, toTaskListResponse } from './tasks.transformer';
import type { PaginationQueryDto, UuidParamDto } from '../../../core/dto/common.dto';
import type { CreateTaskDto, TaskParentParamDto, UpdateTaskDto } from './tasks.dto';
import { TASK_MESSAGES } from './tasks.messages';

export class TasksController {
  constructor(private readonly service: TasksService = tasksService) {}

  create = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<TaskParentParamDto>(c);
    const dto = getValidatedBody<CreateTaskDto>(c);
    const created = await this.service.createTask(projectId, dto);

    return new ApiResponse(toTaskResponse(created), TASK_MESSAGES.CREATED, 201);
  });

  list = asyncHandler(async (c) => {
    const { projectId } = getValidatedParams<TaskParentParamDto>(c);
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { records, total } = await this.service.listTasks(projectId, query);
    const totalPages = Math.ceil(total / query.perPage) || 1;

    return new ApiResponse(toTaskListResponse(records), TASK_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages,
    });
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.getTaskById(param.id);

    return new ApiResponse(toTaskResponse(record), TASK_MESSAGES.RETRIEVED, 200);
  });

  update = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const dto = getValidatedBody<UpdateTaskDto>(c);
    const updated = await this.service.updateTask(param.id, dto);

    return new ApiResponse(toTaskResponse(updated), TASK_MESSAGES.UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteTask(param.id);

    return new ApiResponse(null, TASK_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restoreTask(param.id);

    return new ApiResponse(toTaskResponse(restored), TASK_MESSAGES.RESTORED, 200);
  });
}

export const tasksController = new TasksController();
