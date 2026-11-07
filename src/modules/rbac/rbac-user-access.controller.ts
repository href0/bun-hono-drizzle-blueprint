import type { UuidChildParamDto, UuidParamDto } from '../../core/dto/common.dto';
import {
  asyncHandler,
  currentUser,
  getValidatedBody,
  getValidatedParams,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import type { PutGrantDto } from './rbac-user-access.dto';
import { RbacService, rbacService } from './rbac.service';
import {
  toMyPermissionsResponse,
  toRoleListResponse,
  toUserGrantListResponse,
  toUserGrantResponse,
} from './rbac.transformer';
import { RBAC_MESSAGES } from './rbac.messages';

/** The roles and extra permissions of users, and the caller's own permissions (plan RBAC step 6b). */
export class RbacUserAccessController {
  constructor(private readonly service: RbacService = rbacService) {}

  listRoles = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const roles = await this.service.listUserRoles(id);
    return new ApiResponse(toRoleListResponse(roles), RBAC_MESSAGES.USER_ROLES_RETRIEVED, 200);
  });

  putRole = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    const { created } = await this.service.putUserRole(id, childId);
    return created
      ? new ApiResponse(null, RBAC_MESSAGES.USER_ROLE_ASSIGNED, 201)
      : new ApiResponse(null, RBAC_MESSAGES.ROLE_ALREADY_ASSIGNED, 200);
  });

  revokeRole = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    await this.service.revokeRole(id, childId);
    return new ApiResponse(null, RBAC_MESSAGES.USER_ROLE_REVOKED, 200);
  });

  listGrants = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const grants = await this.service.listUserGrants(id);
    return new ApiResponse(
      toUserGrantListResponse(grants),
      RBAC_MESSAGES.USER_PERMISSIONS_RETRIEVED,
      200,
    );
  });

  putGrant = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    const { grant, created } = await this.service.putGrant(
      id,
      childId,
      getValidatedBody<PutGrantDto>(c),
    );
    const data = toUserGrantResponse(grant);
    return created
      ? new ApiResponse(data, RBAC_MESSAGES.USER_PERMISSION_GRANTED, 201)
      : new ApiResponse(data, RBAC_MESSAGES.USER_PERMISSION_UPDATED, 200);
  });

  revokeGrant = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    await this.service.revokePermission(id, childId);
    return new ApiResponse(null, RBAC_MESSAGES.USER_PERMISSION_REVOKED, 200);
  });

  myPermissions = asyncHandler(async () => {
    const effective = await this.service.listMyPermissions(currentUser().id);
    return new ApiResponse(
      toMyPermissionsResponse(effective),
      RBAC_MESSAGES.MY_PERMISSIONS_RETRIEVED,
      200,
    );
  });
}

export const rbacUserAccessController = new RbacUserAccessController();
