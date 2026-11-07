import { eq, isNull } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { permissions, type Permission } from '../../database/schema';

/** RBAC permissions: global, not tenant-bound (D56). Rows are written by the registry sync and, later, the menu API. */
export class RbacPermissionsRepository extends BaseRepository<typeof permissions> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(permissions, txHost);
  }

  /** A live permission that still counts (not retired, E4) — the only kind that can be given. */
  async findGrantableById(id: string): Promise<Permission | null> {
    const rows = await this.txHost.tx
      .select()
      .from(permissions)
      .where(this.scoped(eq(permissions.id, id), isNull(permissions.retiredAt)))
      .limit(1);
    return rows.at(0) ?? null;
  }
}

export const rbacPermissionsRepository = new RbacPermissionsRepository();
