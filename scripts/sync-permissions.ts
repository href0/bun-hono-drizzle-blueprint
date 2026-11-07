/**
 * Syncs the permission registry (`src/permissions.ts`) into the database of the env file and makes
 * sure the system roles exist (plan RBAC step 2, D48, E4). `bun run db:migrate` runs it after the
 * migrations; alone:
 *
 *   bun run env dev db:sync-permissions
 *
 * Never asks: it only adds, relabels, retires and restores API permissions (menu permissions are
 * never touched) and is idempotent. The database is imported only after the command line is read,
 * so `--help` touches nothing.
 */
import { readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';

readCli(process.argv.slice(2), usageOf('sync-permissions.ts'), {});

const { sqlClient } = await import('../src/database/connection');
const sync = await import('../src/database/rbac/permission-sync');
const { PERMISSION_REGISTRY } = await import('../src/permissions');
try {
  console.log(sync.syncSummary(await sync.syncPermissions(PERMISSION_REGISTRY)));
} catch (error) {
  if (!(error instanceof sync.PermissionRegistryError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sqlClient.end();
}
