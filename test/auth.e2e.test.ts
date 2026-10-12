import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { createApp } from '../src/app';
import { cacheService, type CounterState } from '../src/core/cache';
import { globalErrorHandler, requestContextMiddleware } from '../src/core/middlewares';
import { defaultTxHost } from '../src/database/transaction-host';
import type { User } from '../src/database/schema';
import { authRepository } from '../src/modules/auth/auth.repository';
import { buildAuthRoutes } from '../src/modules/auth/auth.routes';
import { authUsersRepository } from '../src/modules/auth/auth-users.repository';
import { createAuthFakes, sampleUser } from './helpers/auth-fakes';

/**
 * Auth contract through createApp(): the real controller, service and middlewares over in-memory
 * repositories (spyOn on the singletons — never mock.module). The SQL of the repositories is
 * tested in src/modules/auth/*.repository.test.ts; PostgreSQL itself in the integration suite (6.1).
 */

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost'; // app.request() URLs are http://localhost/…: same origin
const COOKIE_ATTRIBUTES = 'Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict';

interface Envelope<T = Record<string, unknown>> {
  status_code: number;
  message: string;
  data: T;
  error?: { code: string; type: string };
}

let fakes: ReturnType<typeof createAuthFakes>;
let counters: Map<string, number>;
const spies: { mockRestore: () => void }[] = [];
let app: Hono;
let ada: User;

beforeAll(async () => {
  ada = sampleUser({ passwordHash: await Bun.password.hash(PASSWORD) });
  const tokens = () => fakes.tokenRepository;
  const users = () => fakes.usersRepository;
  spies.push(
    spyOn(authRepository, 'insert').mockImplementation((row) => tokens().insert(row)),
    spyOn(authRepository, 'findByHash').mockImplementation((hash) => tokens().findByHash(hash)),
    spyOn(authRepository, 'findByHashForUpdate').mockImplementation((hash) =>
      tokens().findByHashForUpdate(hash),
    ),
    spyOn(authRepository, 'markRotated').mockImplementation((id, next) =>
      tokens().markRotated(id, next),
    ),
    spyOn(authRepository, 'revokeFamily').mockImplementation((id) => tokens().revokeFamily(id)),
    spyOn(authRepository, 'revokeAllForUser').mockImplementation((id) =>
      tokens().revokeAllForUser(id),
    ),
    spyOn(authUsersRepository, 'findByEmail').mockImplementation((email) =>
      users().findByEmail(email),
    ),
    spyOn(authUsersRepository, 'findById').mockImplementation((id) => users().findById(id)),
    spyOn(authUsersRepository, 'create').mockImplementation((input) => users().create(input)),
    spyOn(authUsersRepository, 'updateById').mockImplementation((id, patch) =>
      users().updateById(id, patch),
    ),
    // No database: transactions just run their callback.
    spyOn(defaultTxHost, 'run').mockImplementation((fn) => fn()),
    // A working Redis for the brute-force counter (the global rate limit has its own prefix).
    spyOn(cacheService, 'increment').mockImplementation((key): Promise<CounterState | null> => {
      if (!key.startsWith('login-attempts:')) return Promise.resolve(null);
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return Promise.resolve({ count, ttlSeconds: 900 });
    }),
    spyOn(cacheService, 'del').mockImplementation((key) => {
      counters.delete(key);
      return Promise.resolve();
    }),
  );
  app = createApp();
});

beforeEach(() => {
  fakes = createAuthFakes([{ ...ada }]);
  counters = new Map();
});

afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

const post = (
  path: string,
  init: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
) =>
  app.request(`/api/v1/auth${path}`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(init.cookie === undefined ? {} : { Cookie: `refresh_token=${init.cookie}` }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

const refreshCookieOf = (res: Response): string => {
  const header = res.headers.get('set-cookie') ?? '';
  return /^refresh_token=([^;]*);/.exec(header)?.at(1) ?? '';
};

const login = async (): Promise<{
  res: Response;
  body: Envelope;
  cookie: string;
  text: string;
}> => {
  const res = await post('/login', { body: { email: ada.email, password: PASSWORD } });
  const text = await res.text();
  return { res, body: JSON.parse(text) as Envelope, cookie: refreshCookieOf(res), text };
};

describe('POST /api/v1/auth/login', () => {
  it('returns the access token and the user; the refresh token only as an HttpOnly cookie', async () => {
    const { res, body, cookie, text } = await login();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      access_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: 900,
      user: { id: ada.id, email: ada.email, full_name: ada.fullName, role: 'user' },
    });
    expect(res.headers.get('set-cookie')).toBe(
      `refresh_token=${cookie}; Max-Age=604800; ${COOKIE_ATTRIBUTES}`,
    );
    expect(cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(text).not.toContain(cookie);
    expect(text).not.toContain('refresh_token');
  });

  it('wrong password → 401 ERR_AUTH_INVALID_CREDENTIALS, no cookie', async () => {
    const res = await post('/login', { body: { email: ada.email, password: 'wrong' } });

    expect(res.status).toBe(401);
    expect(((await res.json()) as Envelope).error?.code).toBe('ERR_AUTH_INVALID_CREDENTIALS');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('the (max+1)-th failed attempt → 429 ERR_AUTH_LOGIN_LOCKED with Retry-After', async () => {
    const attempt = () => post('/login', { body: { email: ada.email, password: 'wrong' } });
    for (let i = 0; i < 5; i += 1) expect((await attempt()).status).toBe(401);

    const locked = await attempt();

    expect(locked.status).toBe(429);
    expect(((await locked.json()) as Envelope).error?.code).toBe('ERR_AUTH_LOGIN_LOCKED');
    expect(locked.headers.get('retry-after')).toBe('900');
  });

  it('rejects camelCase keys and an invalid email like every endpoint (400)', async () => {
    expect((await post('/login', { body: { Email: ada.email, password: PASSWORD } })).status).toBe(
      400,
    );
    expect(
      (await post('/login', { body: { email: 'not-an-email', password: PASSWORD } })).status,
    ).toBe(400);
  });
});

describe('refresh → reuse → logout', () => {
  it('rotates the cookie, detects reuse of the old token and revokes the newest one too', async () => {
    const { cookie: first } = await login();

    const refreshed = await post('/refresh', { cookie: first });
    const refreshedText = await refreshed.text();
    const second = refreshCookieOf(refreshed);
    expect(refreshed.status).toBe(200);
    expect(second).not.toBe(first);
    expect(refreshed.headers.get('set-cookie')).toBe(
      `refresh_token=${second}; Max-Age=604800; ${COOKIE_ATTRIBUTES}`,
    );
    expect((JSON.parse(refreshedText) as Envelope).data).toEqual({
      access_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: 900,
    });
    expect(refreshedText).not.toContain(second);

    const reused = await post('/refresh', { cookie: first });
    expect(reused.status).toBe(401);
    expect(((await reused.json()) as Envelope).error?.code).toBe('ERR_AUTH_REFRESH_REUSED');
    expect(reused.headers.get('set-cookie')).toBe(
      `refresh_token=; Max-Age=0; ${COOKIE_ATTRIBUTES}`,
    );

    const newest = await post('/refresh', { cookie: second });
    expect(newest.status).toBe(401);
    expect(((await newest.json()) as Envelope).error?.code).toBe('ERR_AUTH_REFRESH_INVALID');
    expect(fakes.tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('refresh without a cookie → 401 ERR_AUTH_REFRESH_INVALID', async () => {
    const res = await post('/refresh');

    expect(res.status).toBe(401);
    expect(((await res.json()) as Envelope).error?.code).toBe('ERR_AUTH_REFRESH_INVALID');
  });

  it('logout revokes the session, clears the cookie and is idempotent', async () => {
    const { cookie } = await login();

    for (const res of [
      await post('/logout', { cookie }),
      await post('/logout', { cookie }),
      await post('/logout'),
    ]) {
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toBe(`refresh_token=; Max-Age=0; ${COOKIE_ATTRIBUTES}`);
    }
    expect(fakes.tokens.map((token) => token.revokedAt !== null)).toEqual([true]);
    expect(((await (await post('/refresh', { cookie })).json()) as Envelope).error?.code).toBe(
      'ERR_AUTH_REFRESH_INVALID',
    );
  });
});

describe('CSRF on the cookie endpoints', () => {
  it('an unlisted Origin → 403 ERR_CSRF_ORIGIN_FORBIDDEN (cookie untouched)', async () => {
    const { cookie } = await login();

    for (const path of ['/refresh', '/logout', '/login']) {
      const res = await post(path, { cookie, headers: { Origin: 'https://evil.example' } });
      expect(res.status).toBe(403);
      expect(((await res.json()) as Envelope).error?.code).toBe('ERR_CSRF_ORIGIN_FORBIDDEN');
    }
    expect(fakes.tokens.map((token) => token.revokedAt)).toEqual([null]);
  });

  it('accepts Sec-Fetch-Site: same-origin, and JSON requests (a cross-site browser needs a CORS preflight for them)', async () => {
    const { cookie } = await login();
    const sameOrigin = await app.request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin', Cookie: `refresh_token=${cookie}` },
    });
    const json = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(sameOrigin.status).toBe(200);
    expect(json.status).toBe(200);
  });
});

describe('bearer endpoints', () => {
  it('GET /me returns the user for a valid access token, 401 without or with a bad one', async () => {
    const { body } = await login();
    const token = (body.data as { access_token: string }).access_token;

    const me = await app.request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    expect(((await me.json()) as Envelope).data).toEqual({
      id: ada.id,
      email: ada.email,
      full_name: ada.fullName,
      role: 'user',
    });

    const missing = await app.request('/api/v1/auth/me');
    const malformed = await app.request('/api/v1/auth/me', { headers: { Authorization: token } });
    const forged = await app.request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}x` },
    });
    expect([missing.status, malformed.status, forged.status]).toEqual([401, 401, 401]);
    expect(((await missing.json()) as Envelope).error?.code).toBe('ERR_UNAUTHORIZED');
    expect(((await forged.json()) as Envelope).error?.code).toBe('ERR_AUTH_TOKEN_INVALID');
  });

  it('POST /logout-all ends every session of the user', async () => {
    const first = await login();
    await login();
    const token = (first.body.data as { access_token: string }).access_token;

    const res = await app.request('/api/v1/auth/logout-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(fakes.tokens.map((row) => row.revokedAt !== null)).toEqual([true, true]);
    expect((await post('/refresh', { cookie: first.cookie })).status).toBe(401);
  });
});

describe('POST /register', () => {
  const registrationApp = (enabled: boolean): Hono => {
    const probe = new Hono();
    probe.use('*', requestContextMiddleware());
    probe.route('/auth', buildAuthRoutes({ registrationEnabled: enabled, csrfOrigins: [] }));
    probe.onError(globalErrorHandler);
    return probe;
  };
  const register = (target: Hono, email: string) =>
    target.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: 'New User', password: 'long enough' }),
    });

  it('is not routed by default (AUTH_REGISTRATION_ENABLED=false) → 404', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        full_name: 'New User',
        password: 'long enough',
      }),
    });
    expect(res.status).toBe(404);
    expect((await register(registrationApp(false), 'new@example.com')).status).toBe(404);
  });

  it('when enabled: 201 with the new user, 409 for a taken email', async () => {
    const enabled = registrationApp(true);

    const created = await register(enabled, 'new@example.com');
    expect(created.status).toBe(201);
    expect(((await created.json()) as Envelope).data).toMatchObject({
      email: 'new@example.com',
      role: 'user',
    });
    expect((await register(enabled, ada.email)).status).toBe(409);
  });
});

describe('POST /change-password and email normalization', () => {
  it('login accepts the email in any case', async () => {
    const res = await post('/login', { body: { email: '  ADA@Example.com', password: PASSWORD } });

    expect(res.status).toBe(200);
  });

  it('changes the password: new cookie here, every other session ends', async () => {
    const other = await login();
    const here = await login();
    const token = (here.body.data as { access_token: string }).access_token;

    const res = await app.request('/api/v1/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: PASSWORD, new_password: 'a brand new password' }),
    });
    const fresh = refreshCookieOf(res);

    expect(res.status).toBe(200);
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await post('/refresh', { cookie: other.cookie })).status).toBe(401);
    expect((await post('/refresh', { cookie: here.cookie })).status).toBe(401);
    expect((await post('/refresh', { cookie: fresh })).status).toBe(200);
  });

  it('a wrong current password → 400 on current_password; without a token → 401', async () => {
    const { body } = await login();
    const token = (body.data as { access_token: string }).access_token;
    const send = (headers: Record<string, string>) =>
      app.request('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ current_password: 'wrong', new_password: 'a brand new password' }),
      });

    const wrong = await send({ Authorization: `Bearer ${token}` });
    expect(wrong.status).toBe(400);
    expect(
      ((await wrong.json()) as { error: { details: { field: string }[] } }).error.details,
    ).toEqual([expect.objectContaining({ field: 'current_password' })]);
    expect((await send({})).status).toBe(401);
  });
});
