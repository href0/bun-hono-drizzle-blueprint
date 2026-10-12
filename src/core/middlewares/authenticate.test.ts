import { describe, expect, it } from 'bun:test';
import { Hono, type Context } from 'hono';
import { getActor, getAuthenticatedUser } from '../context/request-context';
import { UnauthorizedError } from '../errors';
import { signAccessToken } from '../security/jwt';
import { authenticate, currentUser, type AuthenticateOptions } from './authenticate';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';

const USER_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const BASE = '/api/v1';

const appWith = (options: Partial<AuthenticateOptions> = {}): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.use(`${BASE}/*`, authenticate({ basePath: BASE, ...options }));
  const whoAmI = (c: Context) =>
    c.json({ actor: getActor(), user: getAuthenticatedUser() ?? null });
  app.get(`${BASE}/private`, whoAmI);
  app.post(`${BASE}/auth/login`, whoAmI);
  app.get('/outside', (c) => {
    currentUser();
    return c.text('unreachable');
  });
  app.onError(globalErrorHandler);
  return app;
};

const errorCode = async (res: Response): Promise<string | undefined> =>
  ((await res.json()) as { error?: { code: string } }).error?.code;

describe('authenticate (default-deny)', () => {
  it('records the verified user as actor user:<id> with its role', async () => {
    const { token } = await signAccessToken({ userId: USER_ID, role: 'admin' });

    const res = await appWith().request(`${BASE}/private`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      actor: `user:${USER_ID}`,
      user: { id: USER_ID, role: 'admin' },
    });
  });

  it('missing or malformed Authorization header → 401 ERR_UNAUTHORIZED', async () => {
    for (const authorization of [undefined, 'Basic abc', 'Bearer', 'Bearer a b', 'bearer']) {
      const res = await appWith().request(`${BASE}/private`, {
        headers: authorization === undefined ? {} : { Authorization: authorization },
      });
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('ERR_UNAUTHORIZED');
    }
  });

  it('a rejected token keeps the verifier’s error (expired / invalid)', async () => {
    const forged = await appWith().request(`${BASE}/private`, {
      headers: { Authorization: 'Bearer a.b.c' },
    });
    const rejected = await appWith({
      verify: () => Promise.reject(new UnauthorizedError()),
    }).request(`${BASE}/private`, { headers: { Authorization: 'Bearer a.b.c' } });

    expect(await errorCode(forged)).toBe('ERR_AUTH_TOKEN_INVALID');
    expect(rejected.status).toBe(401);
  });

  it('lets PUBLIC_ROUTES through anonymously, matched relative to the mount path', async () => {
    const res = await appWith().request(`${BASE}/auth/login`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actor: 'anonymous', user: null });
    // Same path, other method: not public.
    expect((await appWith().request(`${BASE}/auth/login`)).status).toBe(401);
    expect((await appWith().request(`${BASE}/private`, { method: 'POST' })).status).toBe(401);
  });

  it('asks isPublic with the method and the path below the mount point', async () => {
    const calls: string[] = [];
    await appWith({
      isPublic: (method, path) => {
        calls.push(`${method} ${path}`);
        return true;
      },
    }).request(`${BASE}/private`);

    expect(calls).toEqual(['GET /private']);
  });

  it('currentUser() outside authenticate() → 401, never an anonymous "user"', async () => {
    const res = await appWith().request('/outside');

    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('ERR_UNAUTHORIZED');
  });
});
