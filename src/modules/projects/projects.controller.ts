import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { projectsService, ProjectsService } from './projects.service';
import { toProjectResponse, toProjectListResponse } from './projects.transformer';
import type { PaginationQueryDto, UuidParamDto } from '../../core/dto/common.dto';
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto';
import { PROJECT_MESSAGES } from './projects.messages';

export class ProjectsController {
  constructor(private readonly service: ProjectsService = projectsService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateProjectDto>(c);
    const created = await this.service.createProject(dto);

    return new ApiResponse(toProjectResponse(created), PROJECT_MESSAGES.CREATED, 201);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.getProjectById(param.id);

    return new ApiResponse(toProjectResponse(record), PROJECT_MESSAGES.RETRIEVED, 200);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { records, total } = await this.service.listProjects(query);
    const totalPages = Math.ceil(total / query.perPage) || 1;

    return new ApiResponse(toProjectListResponse(records), PROJECT_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages,
    });
  });

  update = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const dto = getValidatedBody<UpdateProjectDto>(c);
    const updated = await this.service.updateProject(param.id, dto);

    return new ApiResponse(toProjectResponse(updated), PROJECT_MESSAGES.UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteProject(param.id);

    return new ApiResponse(null, PROJECT_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restoreProject(param.id);

    return new ApiResponse(toProjectResponse(restored), PROJECT_MESSAGES.RESTORED, 200);
  });
}

export const projectsController = new ProjectsController();
