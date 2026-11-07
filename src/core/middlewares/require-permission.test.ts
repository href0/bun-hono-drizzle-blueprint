import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { I18N_MESSAGES } from '../i18n/messages';
import { buildOpenApiDocument } from '../openapi/api-docs';
import { describeEndpoint } from '../openapi/describe-endpoint';
import { signAccessToken } from '../security/jwt';
import type { EffectivePermissions } from '../security/rbac';
import { authenticate } from './authenticate';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';
import {
  allowAnyUser,
  permissionContext,
  requirePermission,
  requireSelfOrPermission,
} from './require-permission';

const ALICE = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const BOB = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const ROOT = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8da0';

const GRANTS: Record<string, EffectivePermissions> = {
  [ALICE]: { superAdmin: false, permissions: ['orders.read'] },
  [BOB]: { superAdmin: false, permissions: [] },
  [ROOT]: { superAdmin: true, permissions: [] },
};

/** Every lookup, to prove one resolution per request and none for `allowAnyUser()`. */
const lookups: string[] = [];

const app = new Hono();
app.use('*', requestContextMiddleware());
app.use('/v1/*', authenticate({ basePath: '/v1', isPublic: (_m, path) => path === '/open' }));
app.use(
  '/v1/*',
  permissionContext({
    lookup: (userId) => {
      lookups.push(userId);
      return Promise.resolve(GRANTS[userId] ?? { superAdmin: false, permissions: [] });
    },
  }),
);
app.get('/v1/orders', requirePermission('orders.read'), (c) => c.text('orders'));
app.get('/v1/twice', requirePermission('orders.read'), requirePermission('orders.read'), (c) =>
  c.text('twice'),
);
app.get('/v1/users/:id', requireSelfOrPermission('id', 'users.read'), (c) => c.text('user'));
app.get('/v1/me', allowAnyUser(), (c) => c.text('me'));
app.get('/v1/open', requirePermission('orders.read'), (c) => c.text('unreachable'));
app.onError(globalErrorHandler);

const as = async (userId: string, path: string): Promise<Response> => {
  // The token still carries a role (until plan RBAC step 4b): it authorizes nothing.
  const { token } = await signAccessToken({ userId, role: 'admin' });
  return app.request(path, { headers: { Authorization: `Bearer ${token}` } });
};

describe('requirePermission', () => {
  it('lets a holder of the permission and a super admin through', async () => {
    expect((await as(ALICE, '/v1/orders')).status).toBe(200);
    expect((await as(ROOT, '/v1/orders')).status).toBe(200);
  });

  it('anyone else → 403 ERR_PERMISSION_FORBIDDEN in the standard envelope, whatever role the token names', async () => {
    const res = await as(BOB, '/v1/orders');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { type: 'FORBIDDEN', code: 'ERR_PERMISSION_FORBIDDEN' },
    });
  });

  it('resolves the permissions once per request', async () => {
    lookups.length = 0;
    expect((await as(ALICE, '/v1/twice')).status).toBe(200);
    expect(lookups).toEqual([ALICE]);
  });

  it('answers 401 on a route without a user (public)', async () => {
    expect((await app.request('/v1/open')).status).toBe(401);
  });

  it('fails closed without permissionContext()', async () => {
    const bare = new Hono();
    bare.use('*', requestContextMiddleware());
    bare.use('/v1/*', authenticate({ basePath: '/v1', isPublic: () => false }));
    bare.get('/v1/orders', requirePermission('orders.read'), (c) => c.text('orders'));
    bare.onError(globalErrorHandler);
    const { token } = await signAccessToken({ userId: ROOT, role: 'admin' });

    const res = await bare.request('/v1/orders', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
  });
});

describe('requireSelfOrPermission', () => {
  it('lets the owner and a holder through; anyone else → 403, existing or not', async () => {
    expect((await as(BOB, `/v1/users/${BOB}`)).status).toBe(200);
    expect((await as(ROOT, `/v1/users/${BOB}`)).status).toBe(200);
    expect((await as(BOB, `/v1/users/${ALICE}`)).status).toBe(403);
    expect((await as(ALICE, `/v1/users/${BOB}`)).status).toBe(403);
  });
});

describe('allowAnyUser', () => {
  it('lets every signed-in user through without resolving permissions', async () => {
    lookups.length = 0;
    expect((await as(BOB, '/v1/me')).status).toBe(200);
    expect(lookups).toEqual([]);
  });

  it('answers 401 without a user', async () => {
    const bare = new Hono();
    bare.use('*', requestContextMiddleware());
    bare.get('/me', allowAnyUser(), (c) => c.text('me'));
    bare.onError(globalErrorHandler);
    expect((await bare.request('/me')).status).toBe(401);
  });
});

describe('the guards in the OpenAPI document', () => {
  it('document the 403 code and who may call (x-allowed-callers)', async () => {
    const documented = new Hono();
    const describe = (summary: string) =>
      describeEndpoint({
        tags: ['Probe'],
        summary,
        response: {
          status: 200,
          description: 'ok',
          message: I18N_MESSAGES.SUCCESS,
          data: z.null(),
        },
      });
    documented.get('/v1/a', describe('A'), requirePermission('orders.read'), (c) => c.text('a'));
    documented.get('/v1/b/:id', describe('B'), requireSelfOrPermission('id', 'users.read'), (c) =>
      c.text('b'),
    );
    documented.get('/v1/c', describe('C'), allowAnyUser(), (c) => c.text('c'));

    const doc = await buildOpenApiDocument(documented, {
      title: 't',
      version: '1',
      description: 'd',
    });
    const paths = new Map(Object.entries(doc.paths));
    const operation = (path: string) => paths.get(path)?.get as Record<string, unknown> | undefined;

    expect(operation('/v1/a')?.['x-allowed-callers']).toEqual(['permission:orders.read']);
    expect(Object.keys(paths.get('/v1/a')?.get?.responses ?? {})).toContain('403');
    expect(operation('/v1/b/{id}')?.['x-allowed-callers']).toEqual([
      'self:id',
      'permission:users.read',
    ]);
    expect(operation('/v1/c')?.['x-allowed-callers']).toEqual(['any-user']);
    expect(Object.keys(paths.get('/v1/c')?.get?.responses ?? {})).not.toContain('403');
  });
});
