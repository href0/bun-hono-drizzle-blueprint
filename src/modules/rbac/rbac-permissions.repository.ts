import { and, asc, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import {
  BaseRepository,
  defaultTxHost,
  type ListColumns,
  type TransactionHost,
} from '../../database';
import {
  permissions,
  rolePermissions,
  roles,
  userPermissions,
  userRoles,
  type Permission,
} from '../../database/schema';
import { NOW } from '../../database/schema/columns';
import type { PermissionListQueryDto, PermissionSortField } from './rbac-permissions.dto';
import { rbacScope } from './rbac-scope.util';

/** The allowlist of `GET /permissions` (D41): sortable fields → columns, and the columns `q` searches. */
const PERMISSION_LIST_COLUMNS: ListColumns<PermissionSortField> = {
  sort: { key: permissions.key, group: permissions.groupName, createdAt: permissions.createdAt },
  search: [permissions.key, permissions.label],
};

/** RBAC permissions: global, not tenant-bound (D56). Rows are written by the registry sync and the menu API. */
export class RbacPermissionsRepository extends BaseRepository<typeof permissions> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(permissions, txHost);
  }

  /** A live permission that still counts (not retired, D67) — the only kind that can be given. */
  async findGrantableById(id: string): Promise<Permission | null> {
    const rows = await this.txHost.tx
      .select()
      .from(permissions)
      .where(this.scoped(eq(permissions.id, id), isNull(permissions.retiredAt)))
      .limit(1);
    return rows.at(0) ?? null;
  }

  /** The permissions among `ids` that can be given (live, not retired); unknown ids are left out. */
  async findGrantableByIds(ids: readonly string[]): Promise<Permission[]> {
    if (ids.length === 0) return [];
    return this.txHost.tx
      .select()
      .from(permissions)
      .where(this.scoped(inArray(permissions.id, [...ids]), isNull(permissions.retiredAt)));
  }

  /** The permission with this id, soft-deleted or not (to check what a restore would bring back). */
  async findIncludingDeleted(id: string): Promise<Permission | null> {
    const rows = await this.txHost.tx
      .select()
      .from(permissions)
      .where(eq(permissions.id, id))
      .limit(1);
    return rows.at(0) ?? null;
  }

  /** A page of live permissions for `GET /permissions` and the total under the same filters. */
  async findPermissionList(
    query: PermissionListQueryDto,
  ): Promise<{ rows: Permission[]; total: number }> {
    const retired =
      query.retired === undefined
        ? undefined
        : query.retired
          ? isNotNull(permissions.retiredAt)
          : isNull(permissions.retiredAt);
    return this.findList(
      query,
      PERMISSION_LIST_COLUMNS,
      and(
        query.source === undefined ? undefined : eq(permissions.source, query.source),
        query.group === undefined ? undefined : eq(permissions.groupName, query.group),
        retired,
      ),
    );
  }

  /** The live permissions mapped to `roleId` (retired ones included, so an admin sees them), by key. */
  async findMappedToRole(roleId: string): Promise<Permission[]> {
    const rows = await this.txHost.tx
      .select({ permission: permissions })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(this.scoped(eq(rolePermissions.roleId, roleId), isNull(rolePermissions.deletedAt)))
      .orderBy(asc(permissions.key));
    return rows.map((row) => row.permission);
  }

  /** Every live permission that counts, by key: what a super admin holds (D52). */
  async findCounting(): Promise<Permission[]> {
    return this.txHost.tx
      .select()
      .from(permissions)
      .where(this.scoped(isNull(permissions.retiredAt)))
      .orderBy(asc(permissions.key));
  }

  /**
   * Every user who holds `permissionId` through a live role mapping or a live grant: whose cached
   * permissions deleting or restoring the permission changes.
   */
  async findHolderIds(permissionId: string): Promise<string[]> {
    const throughRoles = await this.txHost.tx
      .selectDistinct({ userId: userRoles.userId })
      .from(rolePermissions)
      .innerJoin(roles, and(eq(roles.id, rolePermissions.roleId), isNull(roles.deletedAt)))
      .innerJoin(
        userRoles,
        and(eq(userRoles.roleId, roles.id), isNull(userRoles.deletedAt), rbacScope(userRoles)),
      )
      .where(
        and(
          eq(rolePermissions.permissionId, permissionId),
          isNull(rolePermissions.deletedAt),
          rbacScope(roles),
        ),
      );
    const throughGrants = await this.txHost.tx
      .selectDistinct({ userId: userPermissions.userId })
      .from(userPermissions)
      .where(
        and(
          eq(userPermissions.permissionId, permissionId),
          isNull(userPermissions.deletedAt),
          or(isNull(userPermissions.expiresAt), gt(userPermissions.expiresAt, NOW)),
          rbacScope(userPermissions),
        ),
      );
    return [...new Set([...throughRoles, ...throughGrants].map((row) => row.userId))];
  }
}

export const rbacPermissionsRepository = new RbacPermissionsRepository();
