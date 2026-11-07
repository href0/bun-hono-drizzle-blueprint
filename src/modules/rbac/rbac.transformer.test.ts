import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { Permission, Role } from '../../database/schema';
import {
  toPermissionListResponse,
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
});
