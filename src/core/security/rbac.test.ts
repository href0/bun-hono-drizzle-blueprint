import { describe, expect, it } from 'bun:test';
import {
  CRUD_ACTIONS,
  crudLabels,
  crudPermissions,
  definePermissions,
  permission,
  registryProblems,
  SUPER_ADMIN_ROLE,
  SYSTEM_ROLES,
  USER_ROLE,
} from './rbac';

describe('crudPermissions', () => {
  it('gives a module the five CRUD actions, keyed <group>.<action> and labelled for admins', () => {
    const tasks = crudPermissions('project-tasks', 'project tasks');
    expect(tasks.read).toBe('project-tasks.read');
    expect(tasks.restore).toBe('project-tasks.restore');
    expect(tasks.all).toEqual([
      { key: 'project-tasks.read', label: 'Read project tasks', group: 'project-tasks' },
      { key: 'project-tasks.create', label: 'Create project tasks', group: 'project-tasks' },
      { key: 'project-tasks.update', label: 'Update project tasks', group: 'project-tasks' },
      { key: 'project-tasks.delete', label: 'Delete project tasks', group: 'project-tasks' },
      { key: 'project-tasks.restore', label: 'Restore project tasks', group: 'project-tasks' },
    ]);
    expect(CRUD_ACTIONS).toHaveLength(5);
  });
});

describe('definePermissions', () => {
  it('keys each action by its camelCase name, kebab-case in the key; all = the definitions', () => {
    const orders = definePermissions('orders', {
      ...crudLabels('orders'),
      approveRefund: 'Approve order refunds',
    });

    expect(orders.approveRefund).toBe('orders.approve-refund');
    expect(orders.read).toBe('orders.read');
    expect(orders.all.map((entry) => entry.key)).toEqual([
      'orders.read',
      'orders.create',
      'orders.update',
      'orders.delete',
      'orders.restore',
      'orders.approve-refund',
    ]);
    expect(orders.all.at(-1)).toEqual({
      key: 'orders.approve-refund',
      label: 'Approve order refunds',
      group: 'orders',
    });
  });

  it('refuses "all" as an action name (it holds the definitions)', () => {
    expect(() => definePermissions('orders', { all: 'Everything' })).toThrow('"all" is reserved');
  });
});

describe('registryProblems', () => {
  it('accepts CRUD and hand-declared actions', () => {
    expect(
      registryProblems([
        ...crudPermissions('orders', 'orders').all,
        permission('orders', 'approve', 'Approve orders'),
      ]),
    ).toEqual([]);
  });

  it('refuses keys that are not <group>.<action> in kebab-case', () => {
    for (const key of [
      'orders',
      'Orders.read',
      'orders.read.all',
      'orders_x.read',
      'orders.Read',
    ]) {
      expect(registryProblems([{ key, label: 'x', group: 'orders' }])).toContain(
        `${key}: a permission key is <group>.<action>, both kebab-case`,
      );
    }
  });

  it('refuses a key outside its group, the menu prefix, empty labels and duplicates', () => {
    expect(
      registryProblems([
        permission('orders', 'read', 'x'),
        { key: 'users.read', label: 'x', group: 'orders' },
      ]),
    ).toEqual(['users.read: the key starts with its group "orders."']);
    expect(registryProblems([permission('menu', 'reports', 'Reports')])).toEqual([
      'menu.reports: "menu." is reserved for menu permissions',
    ]);
    expect(registryProblems([permission('orders', 'read', ' ')])).toEqual([
      'orders.read: the label is empty',
    ]);
    expect(
      registryProblems([permission('orders', 'read', 'a'), permission('orders', 'read', 'b')]),
    ).toEqual(['orders.read: declared more than once']);
  });

  it('refuses values longer than their column', () => {
    const group = `g${'x'.repeat(100)}`;
    expect(registryProblems([permission(group, 'read', 'l'.repeat(151))])).toEqual([
      `${group}.read: the key is longer than 100 characters`,
      `${group}.read: the label is longer than 150 characters`,
      `${group}.read: the group is longer than 100 characters`,
    ]);
  });
});

describe('SYSTEM_ROLES', () => {
  it('are super_admin and user, the roles migration 0010 seeds', () => {
    expect(SYSTEM_ROLES.map((role) => role.key)).toEqual([SUPER_ADMIN_ROLE, USER_ROLE]);
  });
});
