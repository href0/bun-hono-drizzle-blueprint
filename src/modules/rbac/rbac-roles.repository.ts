import { asc, eq, inArray, type SQL } from 'drizzle-orm';
import {
  BaseRepository,
  defaultTxHost,
  type ListColumns,
  type TransactionHost,
} from '../../database';
import { roles, type Role } from '../../database/schema';
import type { RoleListQueryDto, RoleSortField } from './rbac-roles.dto';
import { rbacScope } from './rbac-scope.util';

/** The allowlist of `GET /roles` (D41): sortable fields → columns, and the columns `q` searches. */
const ROLE_LIST_COLUMNS: ListColumns<RoleSortField> = {
  sort: {
    createdAt: roles.createdAt,
    updatedAt: roles.updatedAt,
    key: roles.key,
    name: roles.name,
  },
  search: [roles.key, roles.name],
};

/** RBAC roles (D46–D61): reads and writes through `rbacScope()` (D56). */
export class RbacRolesRepository extends BaseRepository<typeof roles> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(roles, txHost);
  }

  protected override scoped(...conditions: (SQL | undefined)[]): SQL | undefined {
    return super.scoped(rbacScope(roles), ...conditions);
  }

  /** Every live role, by key: the role checklist (`GET /roles/options`, D73). */
  async findAllLive(): Promise<Role[]> {
    return this.txHost.tx.select().from(roles).where(this.scoped()).orderBy(asc(roles.key));
  }

  /** The live roles among `ids`; unknown or deleted ids are left out. */
  async findLiveByIds(ids: readonly string[]): Promise<Role[]> {
    if (ids.length === 0) return [];
    return this.txHost.tx
      .select()
      .from(roles)
      .where(this.scoped(inArray(roles.id, [...ids])));
  }

  /** A page of live roles for `GET /roles` and the total under the same filters. */
  async findRoleList(query: RoleListQueryDto): Promise<{ rows: Role[]; total: number }> {
    return this.findList(
      query,
      ROLE_LIST_COLUMNS,
      query.isSystem === undefined ? undefined : eq(roles.isSystem, query.isSystem),
    );
  }
}

export const rbacRolesRepository = new RbacRolesRepository();
