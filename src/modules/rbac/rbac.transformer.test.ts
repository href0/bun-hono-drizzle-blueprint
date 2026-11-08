import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { Permission, Role } from '../../database/schema';
import {
  toPermissionListResponse,
  toPermissionOptionsResponse,
  toPermissionResponse,
  toRoleListResponse,
  toRoleResponse,
} from './rbac.transformer';

const AT = Temporal.Instant.from('2026-11-07T00:00:00Z');

const role: Role = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  key: 'finance_staff',
  name: 'Finance staff',
  description: null,
  isSystem: false,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const permission: Permission = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f',
  key: 'orders.read',
  label: 'Read orders',
  groupName: 'orders',
  source: 'api',
  retiredAt: null,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

describe('rbac transformers', () => {
  it('a role without audit columns', () => {
    expect(toRoleResponse(role)).toEqual({
      id: role.id,
      key: 'finance_staff',
      name: 'Finance staff',
      description: null,
      isSystem: false,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(toRoleListResponse([role])).toHaveLength(1);
  });

  it('a permission: group from group_name, its endpoints, no audit columns', () => {
    const endpoint = { method: 'GET', path: '/api/v1/orders', summary: 'List orders' };
    expect(toPermissionResponse({ ...permission, endpoints: [endpoint] })).toEqual({
      id: permission.id,
      key: 'orders.read',
      label: 'Read orders',
      group: 'orders',
      source: 'api',
      retiredAt: null,
      endpoints: [endpoint],
      createdAt: AT,
      updatedAt: AT,
    });
    expect(toPermissionListResponse([{ ...permission, endpoints: [] }])).toHaveLength(1);
  });

  it('the checklist catalog: groups by name, permissions by key, grantable kept (D73)', () => {
    const of = (key: string, groupName: string, source = 'api'): Permission => ({
      ...permission,
      id: `id-${key}`,
      key,
      groupName,
      source,
    });
    expect(
      toPermissionOptionsResponse([
        { permission: of('users.read', 'users'), grantable: true },
        { permission: of('orders.update', 'orders'), grantable: false },
        { permission: of('menu.reports', 'menus', 'menu'), grantable: true },
        { permission: of('orders.create', 'orders'), grantable: true },
      ]),
    ).toEqual([
      {
        group: 'menus',
        permissions: [
          {
            id: 'id-menu.reports',
            key: 'menu.reports',
            label: 'Read orders',
            source: 'menu',
            grantable: true,
          },
        ],
      },
      {
        group: 'orders',
        permissions: [
          {
            id: 'id-orders.create',
            key: 'orders.create',
            label: 'Read orders',
            source: 'api',
            grantable: true,
          },
          {
            id: 'id-orders.update',
            key: 'orders.update',
            label: 'Read orders',
            source: 'api',
            grantable: false,
          },
        ],
      },
      {
        group: 'users',
        permissions: [
          {
            id: 'id-users.read',
            key: 'users.read',
            label: 'Read orders',
            source: 'api',
            grantable: true,
          },
        ],
      },
    ]);
    expect(toPermissionOptionsResponse([])).toEqual([]);
  });
});
