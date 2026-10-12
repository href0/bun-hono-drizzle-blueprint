import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { getActor, getAuthenticatedUser } from '../context/request-context';
import { UnauthorizedError } from '../errors';
import { signAccessToken } from '../security/jwt';
import { currentUser, requireAuth } from './authenticate';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';

const USER_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';

const appWith = (middleware = requireAuth()): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.get('/private', middleware, (c) =>
    c.json({ actor: getActor(), user: getAuthenticatedUser() ?? null }),
  );
  app.get('/forgot-require-auth', () => {
    currentUser();
    return new Response('unreachable');
  });
  app.onError(globalErrorHandler);
  return app;
};

const errorCode = async (res: Response): Promise<string | undefined> =>
  ((await res.json()) as { error?: { code: string } }).error?.code;

describe('requireAuth', () => {
  it('records the verified user as actor user:<id> with its role', async () => {
    const { token } = await signAccessToken({ userId: USER_ID, role: 'admin' });

    const res = await appWith().request('/private', {
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
      const res = await appWith().request('/private', {
        headers: authorization === undefined ? {} : { Authorization: authorization },
      });
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('ERR_UNAUTHORIZED');
    }
  });

  it('a rejected token keeps the verifier’s error (expired / invalid)', async () => {
    const res = await appWith(requireAuth(() => Promise.reject(new UnauthorizedError()))).request(
      '/private',
      { headers: { Authorization: 'Bearer a.b.c' } },
    );
    const forged = await appWith().request('/private', {
      headers: { Authorization: 'Bearer a.b.c' },
    });

    expect(res.status).toBe(401);
    expect(await errorCode(forged)).toBe('ERR_AUTH_TOKEN_INVALID');
  });

  it('currentUser() on a route without requireAuth() → 401, never an anonymous "user"', async () => {
    const res = await appWith().request('/forgot-require-auth');

    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('ERR_UNAUTHORIZED');
  });
});
