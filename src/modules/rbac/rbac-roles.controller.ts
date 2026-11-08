import type { UuidChildParamDto, UuidParamDto } from '../../core/dto/common.dto';
import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import type { ReplaceRolePermissionsDto } from './rbac-replace.dto';
import type { CreateRoleDto, RoleListQueryDto, UpdateRoleDto } from './rbac-roles.dto';
import { RbacRolesService, rbacRolesService } from './rbac-roles.service';
import {
  toAccessChangeResponse,
  toPermissionListResponse,
  toRoleListResponse,
  toRoleResponse,
} from './rbac.transformer';
import { RBAC_MESSAGES } from './rbac.messages';

export class RbacRolesController {
  constructor(private readonly service: RbacRolesService = rbacRolesService) {}

  create = asyncHandler(async (c) => {
    const role = await this.service.createRole(getValidatedBody<CreateRoleDto>(c));
    return new ApiResponse(toRoleResponse(role), RBAC_MESSAGES.ROLE_CREATED, 201);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<RoleListQueryDto>(c);
    const { roles, total } = await this.service.listRoles(query);
    return new ApiResponse(toRoleListResponse(roles), RBAC_MESSAGES.ROLE_LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages: Math.ceil(total / query.perPage) || 1,
    });
  });

  getById = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const role = await this.service.getRole(id);
    return new ApiResponse(toRoleResponse(role), RBAC_MESSAGES.ROLE_RETRIEVED, 200);
  });

  update = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const role = await this.service.updateRole(id, getValidatedBody<UpdateRoleDto>(c));
    return new ApiResponse(toRoleResponse(role), RBAC_MESSAGES.ROLE_UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteRole(id);
    return new ApiResponse(null, RBAC_MESSAGES.ROLE_DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const role = await this.service.restoreRole(id);
    return new ApiResponse(toRoleResponse(role), RBAC_MESSAGES.ROLE_RESTORED, 200);
  });

  listPermissions = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const permissions = await this.service.listRolePermissions(id);
    return new ApiResponse(
      toPermissionListResponse(permissions),
      RBAC_MESSAGES.ROLE_PERMISSIONS_RETRIEVED,
      200,
    );
  });

  putPermission = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    const { created } = await this.service.putRolePermission(id, childId);
    return created
      ? new ApiResponse(null, RBAC_MESSAGES.ROLE_PERMISSION_MAPPED, 201)
      : new ApiResponse(null, RBAC_MESSAGES.PERMISSION_ALREADY_MAPPED, 200);
  });

  replacePermissions = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const { permissionIds } = getValidatedBody<ReplaceRolePermissionsDto>(c);
    const change = await this.service.replaceRolePermissions(id, permissionIds);
    return new ApiResponse(
      toAccessChangeResponse(change),
      RBAC_MESSAGES.ROLE_PERMISSIONS_REPLACED,
      200,
    );
  });

  removePermission = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    await this.service.deleteRolePermission(id, childId);
    return new ApiResponse(null, RBAC_MESSAGES.ROLE_PERMISSION_UNMAPPED, 200);
  });
}

export const rbacRolesController = new RbacRolesController();
