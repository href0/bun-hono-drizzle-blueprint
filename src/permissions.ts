import type { PermissionDefinition } from './core/security/rbac';
// partner:start
import { PARTNER_CREDENTIAL_PERMISSIONS } from './modules/partner-credentials/partner-credentials.permissions';
// partner:end
import { USER_PERMISSIONS } from './modules/users/users.permissions';
// Example outbound module (JSONPlaceholder → /users/:id/external-posts): removed by `bun run setup <name>` unless --keep-examples.
import { USER_POST_PERMISSIONS } from './modules/user-posts/user-posts.permissions';
// Example module (header + detail): removed by `bun run setup <name>` unless --keep-examples.
import { ORDER_PERMISSIONS } from './modules/orders/orders.permissions';
// Example modules (parent + dependents 1:N / 1:1): removed by `bun run setup <name>` unless --keep-examples.
import { PROJECT_PERMISSIONS } from './modules/projects/projects.permissions';
import { PROJECT_TASK_PERMISSIONS } from './modules/projects/project-tasks/project-tasks.permissions';
import { PROJECT_BUDGET_PERMISSIONS } from './modules/projects/project-budgets/project-budgets.permissions';
// scaffold:permission-imports — `bun run scaffold` adds the permissions of new modules above this line; keep it.

/**
 * Every API permission of the application (D47–D49): the `<module>.permissions.ts` of each module.
 * `bun run db:migrate` syncs it into the `permissions` table (`bun run db:sync-permissions` alone)
 * and the server refuses to start while a key here is not live in the database. Kept outside the
 * modules because modules never import each other (R03).
 */
export const PERMISSION_REGISTRY: readonly PermissionDefinition[] = [
  ...USER_PERMISSIONS.all,
  // partner:start
  ...PARTNER_CREDENTIAL_PERMISSIONS.all,
  // partner:end
  ...USER_POST_PERMISSIONS.all,
  ...ORDER_PERMISSIONS.all,
  ...PROJECT_PERMISSIONS.all,
  ...PROJECT_TASK_PERMISSIONS.all,
  ...PROJECT_BUDGET_PERMISSIONS.all,
  // scaffold:permissions — `bun run scaffold` adds the permissions of new modules above this line; keep it.
];
