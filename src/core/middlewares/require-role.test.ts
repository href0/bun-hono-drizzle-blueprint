import { I18N_MESSAGES } from '../i18n/messages';
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { buildOpenApiDocument } from '../openapi/api-docs';
import { describeEndpoint } from '../openapi/describe-endpoint';
import { signAccessToken } from '../security/jwt';
import type { Role } from '../security/roles';
import { authenticate } from './authenticate';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';
import { requireRole, requireSelfOrRole } from './require-role';

const app = new Hono();
app.use('*', requestContextMiddleware());
app.use('/v1/*', authenticate({ basePath: '/v1', isPublic: (_m, path) => path === '/open' }));
app.get('/v1/admin', requireRole('admin'), (c) => c.text('admin area'));
app.get('/v1/staff', requireRole('admin', 'user'), (c) => c.text('staff area'));
app.get('/v1/open', requireRole('admin'), (c) => c.text('unreachable'));
app.onError(globalErrorHandler);

const as = async (role: Role, path: string): Promise<Response> => {
  const { token } = await signAccessToken({
    userId: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    role,
  });
  return app.request(path, { headers: { Authorization: `Bearer ${token}` } });
};

describe('requireRole', () => {
  it('lets a listed role through', async () => {
    expect((await as('admin', '/v1/admin')).status).toBe(200);
    expect((await as('user', '/v1/staff')).status).toBe(200);
  });

  it('another role → 403 ERR_ROLE_FORBIDDEN in the standard envelope', async () => {
    const res = await as('user', '/v1/admin');

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { type: 'FORBIDDEN', code: 'ERR_ROLE_FORBIDDEN' },
    });
  });

  it('on a public route (no authenticated user) → 401, not a silent pass', async () => {
    const res = await app.request('/v1/open');

    expect(res.status).toBe(401);
  });
});

describe('requireRole in the OpenAPI document', () => {
  it('documents its 403 next to the route’s own responses', async () => {
    const documented = new Hono();
    documented.get(
      '/v1/admin',
      describeEndpoint({
        tags: ['Probe'],
        summary: 'Admin only',
        response: {
          status: 200,
          description: 'ok',
          message: I18N_MESSAGES.SUCCESS,
          data: z.null(),
        },
      }),
      requireRole('admin'),
      (c) => c.text('admin area'),
    );

    const doc = await buildOpenApiDocument(documented, {
      title: 't',
      version: '1',
      description: 'd',
    });

    const operation = new Map(Object.entries(doc.paths)).get('/v1/admin')?.get;
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '403', '429', '500']);
  });
});

describe('requireSelfOrRole', () => {
  const owned = new Hono();
  owned.use('*', requestContextMiddleware());
  owned.use('/v1/*', authenticate({ basePath: '/v1' }));
  owned.get('/v1/users/:id', requireSelfOrRole('id', 'admin'), (c) => c.text('record'));
  owned.onError(globalErrorHandler);

  const OWNER = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
  const OTHER = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d00';
  const get = async (role: Role, path: string): Promise<number> => {
    const { token } = await signAccessToken({ userId: OWNER, role });
    return (await owned.request(path, { headers: { Authorization: `Bearer ${token}` } })).status;
  };

  it('allows the user named by the parameter and the listed roles, nobody else', async () => {
    expect(await get('user', `/v1/users/${OWNER}`)).toBe(200);
    expect(await get('user', `/v1/users/${OTHER}`)).toBe(403);
    expect(await get('admin', `/v1/users/${OTHER}`)).toBe(200);
  });
});
