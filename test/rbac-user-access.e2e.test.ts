import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { APP_ERROR_CODES, ConflictError, ForbiddenError } from '../src/core/errors';
import type { Permission, Role, UserPermission } from '../src/database/schema';
import { rbacService } from '../src/modules/rbac/rbac.service';
import { requireActorHolds } from '../src/modules/rbac/rbac-grant-guard.util';
import { RBAC_MESSAGES } from '../src/modules/rbac/rbac.messages';
import { authorize, createTestApp, TEST_PRINCIPAL_ID } from './helpers/authorized-app';

/**
 * RBAC user access (D68) — the HTTP contract of `/users/:id/roles`,
 * `/users/:id/permissions` and `/me/permissions` through `createApp()`: the service spied
 * (hermetic). The rules (escalation, last super admin, own account) are proven by the service unit
 * tests and, on a real database, by `test/integration/rbac.int.ts`.
 */

const AT = Temporal.Instant.from('2026-11-07T00:00:00Z');
const USER_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const CHILD_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const AUDIT = { createdBy: 'system', updatedBy: 'system', deletedAt: null };

const role: Role = {
  id: CHILD_ID,
  key: 'finance_staff',
  name: 'Finance staff',
  description: null,
  isSystem: false,
  createdAt: AT,
  updatedAt: AT,
  ...AUDIT,
};
const permission: Permission = {
  id: CHILD_ID,
  key: 'users.read',
  label: 'Read users',
  groupName: 'users',
  source: 'api',
  retiredAt: null,
  createdAt: AT,
  updatedAt: AT,
  ...AUDIT,
};
const grant: UserPermission = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8da0',
  userId: USER_ID,
  permissionId: CHILD_ID,
  expiresAt: null,
  note: 'audit season',
  createdAt: AT,
  updatedAt: AT,
  ...AUDIT,
};

const spies: { mockRestore: () => void }[] = [];
const spy = (method: keyof typeof rbacService, impl: (...args: never[]) => unknown): void => {
  spies.push(spyOn(rbacService, method as any).mockImplementation(impl as any));
};
afterEach(() => {
  for (const s of spies.splice(0)) s.mockRestore();
});

const escalation = () =>
  new ForbiddenError(RBAC_MESSAGES.PERMISSION_ESCALATION, {
    code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
  });

describe('RBAC user access — /users/:id/roles', () => {
  it('GET lists the roles of a user (snake_case)', async () => {
    spy('listUserRoles', () => Promise.resolve([role]));
    const app = await authorize(createTestApp(), ['user-roles.read']);
    const res = await app.request(`/api/v1/users/${USER_ID}/roles`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: [{ key: 'finance_staff', is_system: false }] });
  });

  it('PUT gives a role: 201, 200 when already held, 403 on escalation', async () => {
    let outcome: () => Promise<{ created: boolean }> = () => Promise.resolve({ created: true });
    spy('putUserRole', () => outcome());
    const app = await authorize(createTestApp(), ['user-roles.create']);
    const put = () => app.request(`/api/v1/users/${USER_ID}/roles/${CHILD_ID}`, { method: 'PUT' });

    expect((await put()).status).toBe(201);
    outcome = () => Promise.resolve({ created: false });
    expect((await put()).status).toBe(200);
    outcome = () => Promise.reject(escalation());
    const refused = await put();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({
      error: { code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN },
    });
  });

  it('DELETE revokes a role: 200; own super_admin 403 ERR_SELF_LOCKOUT_FORBIDDEN; last holder 409', async () => {
    let outcome: () => Promise<void> = () => Promise.resolve();
    spy('revokeRole', () => outcome());
    const app = await authorize(createTestApp(), ['user-roles.delete']);
    const del = () =>
      app.request(`/api/v1/users/${USER_ID}/roles/${CHILD_ID}`, { method: 'DELETE' });

    expect((await del()).status).toBe(200);
    outcome = () =>
      Promise.reject(
        new ForbiddenError(RBAC_MESSAGES.OWN_SUPER_ADMIN, {
          code: APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN,
        }),
      );
    expect(await (await del()).json()).toMatchObject({
      error: { code: APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN },
    });
    outcome = () => Promise.reject(new ConflictError(RBAC_MESSAGES.LAST_SUPER_ADMIN));
    expect((await del()).status).toBe(409);
  });
});

describe('RBAC user access — /users/:id/permissions', () => {
  it('GET lists the extra permissions of a user with their permission', async () => {
    spy('listUserGrants', () => Promise.resolve([{ grant, permission }]));
    const app = await authorize(createTestApp(), ['user-permissions.read']);
    const res = await app.request(`/api/v1/users/${USER_ID}/permissions`);
    expect(await res.json()).toMatchObject({
      data: [
        {
          note: 'audit season',
          expires_at: null,
          permission: { key: 'users.read', group: 'users' },
        },
      ],
    });
  });

  it('PUT grants (201) or updates (200) with expires_at and note; a malformed date is a 400', async () => {
    let created = true;
    const calls: unknown[] = [];
    spy('putGrant', (...args: never[]) => {
      calls.push(args[2]);
      return Promise.resolve({ grant: { grant, permission }, created });
    });
    const app = await authorize(createTestApp(), ['user-permissions.create']);
    const put = (body: unknown) =>
      app.request(`/api/v1/users/${USER_ID}/permissions/${CHILD_ID}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });

    expect((await put({ expires_at: '2030-01-01T00:00:00Z', note: 'audit season' })).status).toBe(
      201,
    );
    expect(calls[0]).toMatchObject({ note: 'audit season' });
    created = false;
    expect((await put({})).status).toBe(200);
    expect((await put({ expires_at: 'tomorrow' })).status).toBe(400);
  });

  it('DELETE revokes an extra permission', async () => {
    spy('revokePermission', () => Promise.resolve());
    const app = await authorize(createTestApp(), ['user-permissions.delete']);
    const res = await app.request(`/api/v1/users/${USER_ID}/permissions/${CHILD_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });

  it('DELETE of a permission the caller lacks: 403 naming the key, verbatim (D74)', async () => {
    // The real guard, inside the request: the caller's permissions come from authorize().
    spy('revokePermission', () => requireActorHolds(['users.read']));
    const app = await authorize(createTestApp(), ['user-permissions.delete']);
    const res = await app.request(`/api/v1/users/${USER_ID}/permissions/${CHILD_ID}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      message: RBAC_MESSAGES.PERMISSION_ESCALATION.id,
      error: {
        code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
        details: [{ field: 'users.read', message: RBAC_MESSAGES.PERMISSION_NOT_HELD.id }],
      },
    });
  });
});

describe('RBAC user access — /me/permissions', () => {
  it('every signed-in user reads their own permissions, sorted, for themselves only', async () => {
    const asked: string[] = [];
    spy('listMyPermissions', (...args: never[]) => {
      asked.push(args[0]);
      return Promise.resolve({ superAdmin: false, permissions: ['users.read', 'menu.reports'] });
    });
    // No permission at all: the route is open to every signed-in user (allowAnyUser).
    const app = await authorize(createTestApp(), []);
    const res = await app.request('/api/v1/me/permissions');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { super_admin: false, permissions: ['menu.reports', 'users.read'] },
    });
    expect(asked).toEqual([TEST_PRINCIPAL_ID]);
  });
});
