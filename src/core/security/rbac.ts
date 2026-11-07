/**
 * RBAC building blocks shared by the permission registry (`src/permissions.ts`), its sync into the
 * database (`src/database/rbac/permission-sync.ts`) and, later, the guards (plan RBAC, D46–D61).
 *
 * An API permission is an action (`<module>.<action>`, D47) declared in code — one
 * `<module>.permissions.ts` per module — and synced into the `permissions` table, where roles and
 * users are given it. Menu permissions (`menu.<name>`) are created by administrators, never here.
 */

/** One API permission of the registry: the key routes check, the label and group admins see. */
export interface PermissionDefinition {
  /** `<group>.<action>`, both kebab-case: `orders.read`, `orders.approve`. */
  readonly key: string;
  readonly label: string;
  /** The module the permission belongs to (the admin screen groups by it). */
  readonly group: string;
}

/** The actions `bun run scaffold` gives every module (D54); other actions are declared by hand (D60). */
export const CRUD_ACTIONS = ['read', 'create', 'update', 'delete', 'restore'] as const;

export type CrudAction = (typeof CRUD_ACTIONS)[number];

const CRUD_VERBS: Readonly<Record<CrudAction, string>> = {
  read: 'Read',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  restore: 'Restore',
};

/** One permission `<group>.<action>`. */
export const permission = (group: string, action: string, label: string): PermissionDefinition => ({
  key: `${group}.${action}`,
  label,
  group,
});

/** The five CRUD permissions of a module: `crudPermissions('orders', 'orders')` → `orders.read` "Read orders", … */
export const crudPermissions = (group: string, subject: string): PermissionDefinition[] =>
  CRUD_ACTIONS.map((action) => permission(group, action, `${CRUD_VERBS[action]} ${subject}`));

/** Column limits of the `permissions` table. */
export const PERMISSION_LIMITS = { key: 100, label: 150, group: 100 } as const;

const KEBAB = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
const API_PERMISSION_KEY = new RegExp(`^(${KEBAB})\\.(${KEBAB})$`);

/** The prefix reserved for menu permissions (E1); no API permission may use it. */
export const MENU_PERMISSION_PREFIX = 'menu.';

/**
 * What is wrong with a registry (empty = valid): a key not `<group>.<action>` in kebab-case, a key
 * outside its group, the reserved `menu` group, an empty label, a value longer than its column,
 * a key declared twice.
 */
export const registryProblems = (registry: readonly PermissionDefinition[]): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const { key, label, group } of registry) {
    const match = API_PERMISSION_KEY.exec(key);
    if (match === null) {
      problems.push(`${key}: a permission key is <group>.<action>, both kebab-case`);
    } else if (match[1] !== group) {
      problems.push(`${key}: the key starts with its group "${group}."`);
    }
    if (key.startsWith(MENU_PERMISSION_PREFIX)) {
      problems.push(`${key}: "${MENU_PERMISSION_PREFIX}" is reserved for menu permissions`);
    }
    if (label.trim() === '') problems.push(`${key}: the label is empty`);
    if (key.length > PERMISSION_LIMITS.key) {
      problems.push(`${key}: the key is longer than ${String(PERMISSION_LIMITS.key)} characters`);
    }
    if (label.length > PERMISSION_LIMITS.label) {
      problems.push(
        `${key}: the label is longer than ${String(PERMISSION_LIMITS.label)} characters`,
      );
    }
    if (group.length > PERMISSION_LIMITS.group) {
      problems.push(
        `${key}: the group is longer than ${String(PERMISSION_LIMITS.group)} characters`,
      );
    }
    if (seen.has(key)) problems.push(`${key}: declared more than once`);
    seen.add(key);
  }
  return problems;
};

/** A role the platform needs and keeps (D52, D59): created by the migration and by every sync. */
export interface SystemRole {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

/** Holds every permission, has no `role_permissions` rows and cannot be changed (D52). */
export const SUPER_ADMIN_ROLE = 'super_admin';

/** Given to every new user; no permission until an administrator maps some (D59). */
export const USER_ROLE = 'user';

export const SYSTEM_ROLES: readonly SystemRole[] = [
  {
    key: SUPER_ADMIN_ROLE,
    name: 'Super Admin',
    description: 'Every permission; cannot be changed or deleted',
  },
  {
    key: USER_ROLE,
    name: 'User',
    description:
      'Given to every new user; only routes open to any signed-in user until permissions are mapped',
  },
];
