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

/**
 * The permissions of one module: the key of each action by its camelCase name — what routes pass to
 * `requirePermission()`, so a key is written once and a typo is a compile error — and `all`, the
 * definitions collected in `src/permissions.ts`.
 */
export type ModulePermissions<A extends string> = { readonly [K in A]: string } & {
  readonly all: readonly PermissionDefinition[];
};

/** `rotateSecret` → `rotate-secret`: actions are camelCase in code, kebab-case in keys. */
const kebabOf = (action: string): string => action.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * `definePermissions('orders', { read: 'Read orders', approveRefund: 'Approve order refunds' })`
 * → `.read` = `orders.read`, `.approveRefund` = `orders.approve-refund`,
 * `.all` = their definitions (label and group for the admin screen). `all` is not an action name.
 */
export const definePermissions = <A extends string>(
  group: string,
  labels: Readonly<Record<A, string>>,
): ModulePermissions<A> => {
  const entries = Object.entries<string>(labels);
  if (entries.some(([action]) => action === 'all')) {
    throw new Error(`${group}: "all" is reserved, not an action name`);
  }
  const keys = Object.fromEntries(
    entries.map(([action]) => [action, `${group}.${kebabOf(action)}`]),
  ) as Record<A, string>;
  return {
    ...keys,
    all: entries.map(([action, label]) => permission(group, kebabOf(action), label)),
  };
};

/** The labels of the five CRUD actions: `crudLabels('orders')` → `{ read: 'Read orders', … }`. */
export const crudLabels = (subject: string): Record<CrudAction, string> => ({
  read: `${CRUD_VERBS.read} ${subject}`,
  create: `${CRUD_VERBS.create} ${subject}`,
  update: `${CRUD_VERBS.update} ${subject}`,
  delete: `${CRUD_VERBS.delete} ${subject}`,
  restore: `${CRUD_VERBS.restore} ${subject}`,
});

/** The five CRUD permissions of a module (D54): `crudPermissions('orders', 'orders').read` = `orders.read`. */
export const crudPermissions = (group: string, subject: string): ModulePermissions<CrudAction> =>
  definePermissions(group, crudLabels(subject));

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

/**
 * What a user may do (D52): `superAdmin` holds every permission that is not retired (no list is
 * kept, so permissions added by a later sync count at once); otherwise the keys of every live role
 * ∪ the user's own grants that have not expired.
 */
export interface EffectivePermissions {
  superAdmin: boolean;
  permissions: string[];
}

/** Resolves the effective permissions of a user (the RBAC module's, injected by `src/app.ts`). */
export type PermissionLookup = (userId: string) => Promise<EffectivePermissions>;

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
