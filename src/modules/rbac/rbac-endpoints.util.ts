import { getRequestContext } from '../../core/context/request-context';
import type { PermissionEndpoint, PermissionEndpoints } from '../../core/security/rbac';
import type { Permission } from '../../database/schema';

/** A permission with the endpoints it opens (D47) — what the admin API returns. */
export type PermissionWithEndpoints = Permission & { endpoints: readonly PermissionEndpoint[] };

const NONE: PermissionEndpoints = new Map();

/**
 * Adds to each permission the endpoints it opens, from the app's routes (`permissionContext()`,
 * built from the OpenAPI document once per app). Outside a request, or for a menu permission, the
 * list is empty.
 */
export const withEndpoints = async (
  permissions: readonly Permission[],
): Promise<PermissionWithEndpoints[]> => {
  const source = getRequestContext()?.permissionEndpoints;
  const endpoints = source === undefined ? NONE : await source();
  return permissions.map((permission) => ({
    ...permission,
    endpoints: permission.source === 'api' ? (endpoints.get(permission.key) ?? []) : [],
  }));
};
