import type { UuidParamDto } from '../../core/dto/common.dto';
import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import type {
  CreateMenuPermissionDto,
  PermissionListQueryDto,
  UpdateMenuPermissionDto,
} from './rbac-permissions.dto';
import { RbacPermissionsService, rbacPermissionsService } from './rbac-permissions.service';
import {
  toPermissionListResponse,
  toPermissionOptionsResponse,
  toPermissionResponse,
} from './rbac.transformer';
import { RBAC_MESSAGES } from './rbac.messages';

export class RbacPermissionsController {
  constructor(private readonly service: RbacPermissionsService = rbacPermissionsService) {}

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<PermissionListQueryDto>(c);
    const { permissions, total } = await this.service.listPermissions(query);
    return new ApiResponse(
      toPermissionListResponse(permissions),
      RBAC_MESSAGES.PERMISSION_LIST_RETRIEVED,
      200,
      {
        currentPage: query.page,
        perPage: query.perPage,
        totalItems: total,
        totalPages: Math.ceil(total / query.perPage) || 1,
      },
    );
  });

  options = asyncHandler(async () => {
    const options = await this.service.listPermissionOptions();
    return new ApiResponse(
      toPermissionOptionsResponse(options),
      RBAC_MESSAGES.PERMISSION_OPTIONS_RETRIEVED,
      200,
    );
  });

  getById = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const permission = await this.service.getPermission(id);
    return new ApiResponse(
      toPermissionResponse(permission),
      RBAC_MESSAGES.PERMISSION_RETRIEVED,
      200,
    );
  });

  create = asyncHandler(async (c) => {
    const permission = await this.service.createMenuPermission(
      getValidatedBody<CreateMenuPermissionDto>(c),
    );
    return new ApiResponse(toPermissionResponse(permission), RBAC_MESSAGES.PERMISSION_CREATED, 201);
  });

  update = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const permission = await this.service.updateMenuPermission(
      id,
      getValidatedBody<UpdateMenuPermissionDto>(c),
    );
    return new ApiResponse(toPermissionResponse(permission), RBAC_MESSAGES.PERMISSION_UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteMenuPermission(id);
    return new ApiResponse(null, RBAC_MESSAGES.PERMISSION_DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const permission = await this.service.restoreMenuPermission(id);
    return new ApiResponse(
      toPermissionResponse(permission),
      RBAC_MESSAGES.PERMISSION_RESTORED,
      200,
    );
  });
}

export const rbacPermissionsController = new RbacPermissionsController();
