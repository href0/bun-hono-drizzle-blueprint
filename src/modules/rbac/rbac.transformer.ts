import type { Role } from '../../database/schema';
import type {
  GrantWithPermission,
  MyPermissionsResponse,
  UserGrantResponse,
} from './rbac-user-access.dto';
import type { EffectivePermissions } from '../../core/security/rbac';
import type { PermissionWithEndpoints } from './rbac-endpoints.util';
import type { PermissionResponse, PermissionSource } from './rbac-permissions.dto';
import type { RoleResponse } from './rbac-roles.dto';

export const toRoleResponse = (role: Role): RoleResponse => ({
  id: role.id,
  key: role.key,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

export const toRoleListResponse = (roles: readonly Role[]): RoleResponse[] =>
  roles.map(toRoleResponse);

export const toPermissionResponse = (permission: PermissionWithEndpoints): PermissionResponse => ({
  id: permission.id,
  key: permission.key,
  label: permission.label,
  group: permission.groupName,
  // The CHECK constraint `permissions_source_check` allows exactly these two values.
  source: permission.source as PermissionSource,
  retiredAt: permission.retiredAt,
  endpoints: permission.endpoints.map(({ method, path, summary }) => ({ method, path, summary })),
  createdAt: permission.createdAt,
  updatedAt: permission.updatedAt,
});

export const toPermissionListResponse = (
  permissions: readonly PermissionWithEndpoints[],
): PermissionResponse[] => permissions.map(toPermissionResponse);

export const toUserGrantResponse = ({
  grant,
  permission,
}: GrantWithPermission): UserGrantResponse => ({
  id: grant.id,
  permission: {
    id: permission.id,
    key: permission.key,
    label: permission.label,
    group: permission.groupName,
    source: permission.source as PermissionSource,
  },
  expiresAt: grant.expiresAt,
  note: grant.note,
  createdAt: grant.createdAt,
  updatedAt: grant.updatedAt,
});

export const toUserGrantListResponse = (
  grants: readonly GrantWithPermission[],
): UserGrantResponse[] => grants.map(toUserGrantResponse);

export const toMyPermissionsResponse = (
  effective: EffectivePermissions,
): MyPermissionsResponse => ({
  superAdmin: effective.superAdmin,
  permissions: [...effective.permissions].sort(),
});
