import type { Role } from '../../database/schema';
import type {
  GrantWithPermission,
  MyPermissionsResponse,
  UserGrantResponse,
} from './rbac-user-access.dto';
import type { EffectivePermissions } from '../../core/security/rbac';
import type { PermissionWithEndpoints } from './rbac-endpoints.util';
import type {
  PermissionOption,
  PermissionOptionGroupResponse,
  PermissionResponse,
  PermissionSource,
} from './rbac-permissions.dto';
import type { AccessChange, ChangedItem } from './rbac-replace.dto';
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

/** The checklist catalog (D73): groups by name, each with its permissions by key. */
export const toPermissionOptionsResponse = (
  options: readonly PermissionOption[],
): PermissionOptionGroupResponse[] => {
  const groups = new Map<string, PermissionOption[]>();
  for (const option of options) {
    const group = groups.get(option.permission.groupName) ?? [];
    group.push(option);
    groups.set(option.permission.groupName, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, members]) => ({
      group,
      permissions: members
        .toSorted((a, b) => a.permission.key.localeCompare(b.permission.key))
        .map(({ permission, grantable }) => ({
          id: permission.id,
          key: permission.key,
          label: permission.label,
          source: permission.source as PermissionSource,
          grantable,
        })),
    }));
};

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

const byKey = (items: readonly ChangedItem[]): ChangedItem[] =>
  items.toSorted((a, b) => a.key.localeCompare(b.key));

/** What a replace did (D72), each list by key. */
export const toAccessChangeResponse = (change: AccessChange): AccessChange => ({
  added: byKey(change.added),
  removed: byKey(change.removed),
  unchanged: byKey(change.unchanged),
});
