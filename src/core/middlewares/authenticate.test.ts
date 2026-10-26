import { describe, expect, it } from 'bun:test';
import { Hono, type Context } from 'hono';
import {
  getActor,
  getAuthenticatedUser,
  // partner:start
  setAuthenticatedPartner,
  // partner:end
} from '../context/request-context';
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

  it('401s carry the RFC 6750 challenge: Bearer, with invalid_token for a rejected token', async () => {
    const missing = await appWith().request(`${BASE}/private`);
    const forged = await appWith().request(`${BASE}/private`, {
      headers: { Authorization: 'Bearer a.b.c' },
    });

    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect(forged.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
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

// partner:start
describe('authenticate — partner routes', () => {
  it('leaves /partner/* to partnerAuth() only once a partner is verified (fail-closed)', async () => {
    const app = new Hono();
    app.use('*', requestContextMiddleware());
    // Stand-in for partnerAuth(): marks the request as coming from a verified partner on demand.
    app.use(`${BASE}/partner/*`, async (c, next) => {
      if (c.req.header('x-test-partner')) setAuthenticatedPartner({ code: 'acme' });
      await next();
    });
    app.use(`${BASE}/*`, authenticate({ basePath: BASE }));
    app.get(`${BASE}/partner/ping`, (c) => c.json({ actor: getActor() }));
    app.get(`${BASE}/partnership`, (c) => c.text('not a partner route'));
    app.onError(globalErrorHandler);

    const verified = await app.request(`${BASE}/partner/ping`, {
      headers: { 'x-test-partner': '1' },
    });
    expect(await verified.json()).toEqual({ actor: 'partner:acme' });

    // No verified partner (e.g. partnerAuth() not mounted): the route needs a bearer token.
    expect(await errorCode(await app.request(`${BASE}/partner/ping`))).toBe('ERR_UNAUTHORIZED');
    // Segment boundary: /partnership is not a partner route.
    expect(
      await errorCode(
        await app.request(`${BASE}/partnership`, { headers: { 'x-test-partner': '1' } }),
      ),
    ).toBe('ERR_UNAUTHORIZED');
  });
});
// partner:end
