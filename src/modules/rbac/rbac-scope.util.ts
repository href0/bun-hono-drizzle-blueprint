import type { SQL } from 'drizzle-orm';
import type { roles, userPermissions, userRoles } from '../../database/schema';

/** The RBAC tables that will carry `tenant_id` (D56); `permissions` / `role_permissions` stay global. */
export type TenantScopedRbacTable = typeof roles | typeof userRoles | typeof userPermissions;

/**
 * The one filter every RBAC query applies to the tables that become tenant-bound (D56), on top of
 * "live rows only". Today there is no tenant, so it adds nothing; tenancy turns it into
 * `tenant_id = <tenant of the request>` (and `roles.tenant_id IS NULL OR …` for system roles) here,
 * without changing a query, a cache key or the API. Never take the tenant from client input.
 */
export const rbacScope = (_table: TenantScopedRbacTable): SQL | undefined => undefined;
