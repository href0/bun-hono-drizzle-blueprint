import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { APP_ERROR_CODES, ConflictError, ForbiddenError, NotFoundError } from '../src/core/errors';
import type { Permission, Role } from '../src/database/schema';
import { rbacPermissionsRepository } from '../src/modules/rbac/rbac-permissions.repository';
import { rbacPermissionsService } from '../src/modules/rbac/rbac-permissions.service';
import { rbacRolesService } from '../src/modules/rbac/rbac-roles.service';
import { RBAC_MESSAGES } from '../src/modules/rbac/rbac.messages';
import { authorize, createTestApp } from './helpers/authorized-app';

/**
 * RBAC admin API (D68) — the HTTP contract of `/roles` and `/permissions` through
 * `createApp()`: services spied (hermetic), so routes, guards, validation, controllers and
 * transformers run for real. The rules themselves are proven by the service unit tests and, on a
 * real database, by `test/integration/rbac.int.ts`.
 */

const AT = Temporal.Instant.from('2026-11-07T00:00:00Z');
const ROLE_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const PERMISSION_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const role: Role = {
  id: ROLE_ID,
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
  id: PERMISSION_ID,
  key: 'users.read',
  label: 'Read users',
  groupName: 'users',
  source: 'api',
  retiredAt: null,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const spies: { mockRestore: () => void }[] = [];
const spy = <T extends object, K extends keyof T>(target: T, method: K, impl: T[K]): void => {
  spies.push(spyOn(target, method as any).mockImplementation(impl as any));
};
afterEach(() => {
  for (const s of spies.splice(0)) s.mockRestore();
});

const bodyOf = async (res: Response): Promise<Record<string, unknown>> =>
  (await res.json()) as Record<string, unknown>;

describe('RBAC admin API — /roles', () => {
  it('POST creates a role (201, snake_case) and refuses an invalid key with 400', async () => {
    spy(rbacRolesService, 'createRole', () => Promise.resolve(role));
    const app = await authorize(createTestApp(), ['roles.create']);

    const res = await app.request('/api/v1/roles', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ key: 'finance_staff', name: 'Finance staff' }),
    });
    expect(res.status).toBe(201);
    expect(await bodyOf(res)).toMatchObject({
      data: { id: ROLE_ID, key: 'finance_staff', is_system: false, description: null },
    });

    const bad = await app.request('/api/v1/roles', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ key: 'Finance Staff', name: 'x' }),
    });
    expect(bad.status).toBe(400);
  });

  it('GET lists roles with meta, filters by is_system; GET /:id reads one (404 when unknown)', async () => {
    const list = spyOn(rbacRolesService, 'listRoles').mockResolvedValue({
      roles: [role],
      total: 1,
    });
    spies.push(list);
    spy(rbacRolesService, 'getRole', (id: string) =>
      id === ROLE_ID ? Promise.resolve(role) : Promise.reject(new NotFoundError('nope')),
    );
    const app = await authorize(createTestApp(), ['roles.read']);

    const res = await app.request('/api/v1/roles?is_system=false&sort=key');
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toMatchObject({ meta: { total_items: 1 } });
    expect(list.mock.calls[0]?.[0]).toMatchObject({ isSystem: false });

    expect((await app.request(`/api/v1/roles/${ROLE_ID}`)).status).toBe(200);
    expect((await app.request(`/api/v1/roles/${PERMISSION_ID}`)).status).toBe(404);
  });

  it('PATCH updates (409 for super_admin), DELETE deletes (409 for a system role), restore restores', async () => {
    spy(rbacRolesService, 'updateRole', (id: string) =>
      id === ROLE_ID
        ? Promise.resolve({ ...role, name: 'Finance' })
        : Promise.reject(new ConflictError(RBAC_MESSAGES.SUPER_ADMIN_FIXED)),
    );
    spy(rbacRolesService, 'deleteRole', (id: string) =>
      id === ROLE_ID
        ? Promise.resolve()
        : Promise.reject(new ConflictError(RBAC_MESSAGES.SYSTEM_ROLE_FIXED)),
    );
    spy(rbacRolesService, 'restoreRole', () => Promise.resolve(role));
    const app = await authorize(createTestApp(), ['roles.update', 'roles.delete', 'roles.restore']);
    const patch = (id: string) =>
      app.request(`/api/v1/roles/${id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: 'Finance' }),
      });

    expect(await bodyOf(await patch(ROLE_ID))).toMatchObject({ data: { name: 'Finance' } });
    expect((await patch(PERMISSION_ID)).status).toBe(409);
    expect((await app.request(`/api/v1/roles/${ROLE_ID}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/api/v1/roles/${PERMISSION_ID}`, { method: 'DELETE' })).status).toBe(
      409,
    );
    expect((await app.request(`/api/v1/roles/${ROLE_ID}/restore`, { method: 'POST' })).status).toBe(
      200,
    );
  });

  it('a restore that would escalate answers 403 ERR_PERMISSION_ESCALATION_FORBIDDEN', async () => {
    spy(rbacRolesService, 'restoreRole', () =>
      Promise.reject(
        new ForbiddenError(RBAC_MESSAGES.PERMISSION_ESCALATION, {
          code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
        }),
      ),
    );
    const app = await authorize(createTestApp(), ['roles.restore']);
    const res = await app.request(`/api/v1/roles/${ROLE_ID}/restore`, { method: 'POST' });
    expect(res.status).toBe(403);
    expect(await bodyOf(res)).toMatchObject({
      error: { code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN },
    });
  });

  it('GET /:id/permissions lists the permissions of a role with their endpoints', async () => {
    spy(rbacRolesService, 'listRolePermissions', () =>
      Promise.resolve([{ ...permission, endpoints: [] }]),
    );
    const app = await authorize(createTestApp(), ['roles.read']);
    const res = await app.request(`/api/v1/roles/${ROLE_ID}/permissions`);
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toMatchObject({
      data: [{ key: 'users.read', group: 'users', source: 'api', endpoints: [] }],
    });
  });

  it('PUT /:id/permissions/:childId: 201 added, 200 already there; DELETE removes', async () => {
    let created = true;
    spy(rbacRolesService, 'putRolePermission', () => Promise.resolve({ created }));
    spy(rbacRolesService, 'deleteRolePermission', () => Promise.resolve());
    const app = await authorize(createTestApp(), ['roles.update']);
    const path = `/api/v1/roles/${ROLE_ID}/permissions/${PERMISSION_ID}`;

    expect((await app.request(path, { method: 'PUT' })).status).toBe(201);
    created = false;
    expect((await app.request(path, { method: 'PUT' })).status).toBe(200);
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(200);
    expect(
      (await app.request(`/api/v1/roles/${ROLE_ID}/permissions/x`, { method: 'PUT' })).status,
    ).toBe(400);
  });

  it('PUT /:id/permissions replaces the whole set: the change by key; 400 for a bad body (D72)', async () => {
    const replace = spyOn(rbacRolesService, 'replaceRolePermissions').mockResolvedValue({
      added: [
        { id: PERMISSION_ID, key: 'users.read' },
        { id: ROLE_ID, key: 'menu.reports' },
      ],
      removed: [],
      unchanged: [],
    });
    spies.push(replace);
    const app = await authorize(createTestApp(), ['roles.update']);
    const put = (body: unknown) =>
      app.request(`/api/v1/roles/${ROLE_ID}/permissions`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });

    const res = await put({ permission_ids: [PERMISSION_ID, ROLE_ID] });
    expect(res.status).toBe(200);
    expect(replace.mock.calls[0]).toEqual([ROLE_ID, [PERMISSION_ID, ROLE_ID]]);
    expect(await bodyOf(res)).toMatchObject({
      message: RBAC_MESSAGES.ROLE_PERMISSIONS_REPLACED.id,
      data: {
        added: [
          { id: ROLE_ID, key: 'menu.reports' },
          { id: PERMISSION_ID, key: 'users.read' },
        ],
        removed: [],
        unchanged: [],
      },
    });

    // `{}` is not "remove everything": the set must be sent, `[]` included.
    expect((await put({})).status).toBe(400);
    expect((await put({ permission_ids: ['x'] })).status).toBe(400);
    const repeated = await put({ permission_ids: [PERMISSION_ID, PERMISSION_ID] });
    expect(repeated.status).toBe(400);
    expect(await bodyOf(repeated)).toMatchObject({
      error: { details: [{ field: 'permission_ids.1' }] },
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect((await put({ permission_ids: [] })).status).toBe(200);

    const denied = await authorize(createTestApp(), ['roles.read']);
    const refused = await denied.request(`/api/v1/roles/${ROLE_ID}/permissions`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ permission_ids: [] }),
    });
    expect(refused.status).toBe(403);
  });
});

describe('RBAC admin API — /permissions', () => {
  it('GET /options: every counting permission by group, not paginated, grantable per caller (D73)', async () => {
    // The real service: rows from a stand-in; grantable from the caller's permissions.
    const menu: Permission = {
      ...permission,
      id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8da0',
      key: 'menu.reports',
      label: 'Reports menu',
      groupName: 'menus',
      source: 'menu',
    };
    spy(rbacPermissionsRepository, 'findCounting', () => Promise.resolve([menu, permission]));
    const app = await authorize(createTestApp(), ['permissions.read', 'users.read']);

    const res = await app.request('/api/v1/permissions/options');
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.meta).toBeUndefined();
    expect(body).toMatchObject({
      message: RBAC_MESSAGES.PERMISSION_OPTIONS_RETRIEVED.id,
      data: [
        {
          group: 'menus',
          permissions: [{ key: 'menu.reports', source: 'menu', grantable: false }],
        },
        {
          group: 'users',
          permissions: [
            { id: PERMISSION_ID, key: 'users.read', label: 'Read users', grantable: true },
          ],
        },
      ],
    });

    const denied = await authorize(createTestApp(), ['roles.read']);
    expect((await denied.request('/api/v1/permissions/options')).status).toBe(403);
  });

  it('GET /:id returns the endpoints the permission opens, read from the routes of the app (D47)', async () => {
    // The real service: only the row comes from a stand-in; the endpoints come from createApp().
    spy(rbacPermissionsRepository, 'findById', () => Promise.resolve(permission));
    const app = await authorize(createTestApp(), ['permissions.read']);

    const res = await app.request(`/api/v1/permissions/${PERMISSION_ID}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { endpoints: { method: string; path: string }[] };
    };
    expect(data.endpoints.map(({ method, path }) => `${method} ${path}`)).toEqual(
      // users: a module every project keeps (setup removes the examples).
      expect.arrayContaining(['GET /api/v1/users', 'GET /api/v1/users/{id}']),
    );
  });

  it('GET lists permissions (filters source / retired), refuses an unknown source with 400', async () => {
    const list = spyOn(rbacPermissionsService, 'listPermissions').mockResolvedValue({
      permissions: [{ ...permission, endpoints: [] }],
      total: 1,
    });
    spies.push(list);
    const app = await authorize(createTestApp(), ['permissions.read']);

    const res = await app.request('/api/v1/permissions?source=menu&retired=false&group=orders');
    expect(res.status).toBe(200);
    expect(list.mock.calls[0]?.[0]).toMatchObject({
      source: 'menu',
      retired: false,
      group: 'orders',
    });
    expect((await app.request('/api/v1/permissions?source=other')).status).toBe(400);
  });

  it('POST creates a menu permission; a key without menu. is a 400', async () => {
    spy(rbacPermissionsService, 'createMenuPermission', () =>
      Promise.resolve({ ...permission, key: 'menu.reports', source: 'menu', endpoints: [] }),
    );
    const app = await authorize(createTestApp(), ['permissions.create']);
    const post = (key: string) =>
      app.request('/api/v1/permissions', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ key, label: 'Reports', group: 'menus' }),
      });

    expect((await post('menu.reports')).status).toBe(201);
    expect((await post('users.read')).status).toBe(400);
  });

  it('PATCH / DELETE / restore a menu permission; an API permission is a 409', async () => {
    const menu = { ...permission, key: 'menu.reports', source: 'menu', endpoints: [] };
    spy(rbacPermissionsService, 'updateMenuPermission', (id: string) =>
      id === PERMISSION_ID
        ? Promise.resolve(menu)
        : Promise.reject(new ConflictError(RBAC_MESSAGES.API_PERMISSION_FIXED)),
    );
    spy(rbacPermissionsService, 'deleteMenuPermission', () => Promise.resolve());
    spy(rbacPermissionsService, 'restoreMenuPermission', () => Promise.resolve(menu));
    const app = await authorize(createTestApp(), [
      'permissions.update',
      'permissions.delete',
      'permissions.restore',
    ]);
    const patch = (id: string) =>
      app.request(`/api/v1/permissions/${id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ label: 'Reports' }),
      });

    expect((await patch(PERMISSION_ID)).status).toBe(200);
    expect((await patch(ROLE_ID)).status).toBe(409);
    expect(
      (await app.request(`/api/v1/permissions/${PERMISSION_ID}`, { method: 'DELETE' })).status,
    ).toBe(200);
    expect(
      (await app.request(`/api/v1/permissions/${PERMISSION_ID}/restore`, { method: 'POST' }))
        .status,
    ).toBe(200);
  });
});
