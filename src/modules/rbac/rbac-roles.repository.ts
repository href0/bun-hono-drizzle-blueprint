import type { SQL } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { roles } from '../../database/schema';
import { rbacScope } from './rbac-scope.util';

/** RBAC roles (D46–D61): reads and writes through `rbacScope()` (D56). */
export class RbacRolesRepository extends BaseRepository<typeof roles> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(roles, txHost);
  }

  protected override scoped(...conditions: (SQL | undefined)[]): SQL | undefined {
    return super.scoped(rbacScope(roles), ...conditions);
  }
}

export const rbacRolesRepository = new RbacRolesRepository();
