import { beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { createApp } from '../../src/app';
import { authConfig } from '../../src/config';
import { hashPassword } from '../../src/core/security/password';
import { db } from '../../src/database/connection';
import { authRefreshTokens } from '../../src/database/schema';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { asActor, unique } from '../helpers/integration';

/**
 * Login, refresh-token rotation and reuse detection through createApp() on a real PostgreSQL and
 * Redis (plan step 6.1): the row locks of the token family and the failed-login counter, which
 * the e2e suite replaces with in-memory fakes.
 */

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost'; // app.request() URLs are http://localhost/…: same origin

interface Envelope {
  data: { access_token?: string; email?: string };
  error?: { code: string };
}

let app: Hono;

beforeAll(() => {
  app = createApp();
});

const createUser = async (): Promise<{ id: string; email: string }> => {
  const email = `${unique('auth')}@example.com`;
  const user = await asActor(async () =>
    new UsersRepository().create({
      email,
      fullName: 'Integration User',
      passwordHash: await hashPassword(PASSWORD),
    }),
  );
  return { id: user.id, email };
};

const post = (path: string, init: { body?: unknown; cookie?: string } = {}): Promise<Response> =>
  Promise.resolve(
    app.request(`/api/v1/auth${path}`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.cookie === undefined ? {} : { Cookie: `refresh_token=${init.cookie}` }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );

const cookieOf = (res: Response): string =>
  /^refresh_token=([^;]*);/.exec(res.headers.get('set-cookie') ?? '')?.at(1) ?? '';

const login = async (email: string, password = PASSWORD): Promise<Response> =>
  post('/login', { body: { email, password } });

const errorCode = async (res: Response): Promise<string | undefined> =>
  ((await res.json()) as Envelope).error?.code;

describe('login and the signed-in user', () => {
  it('logs in against the stored password hash and reads the user back with the access token', async () => {
    const user = await createUser();

    const res = await login(user.email);
    expect(res.status).toBe(200);
    const token = ((await res.json()) as Envelope).data.access_token ?? '';

    const me = await app.request('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    expect(((await me.json()) as Envelope).data.email).toBe(user.email);
  });

  it('locks the account for this client after AUTH_LOGIN_MAX_ATTEMPTS failures (Redis counter)', async () => {
    const user = await createUser();
    for (let attempt = 0; attempt < authConfig.AUTH_LOGIN_MAX_ATTEMPTS; attempt += 1) {
      expect(await errorCode(await login(user.email, 'wrong password'))).toBe(
        'ERR_AUTH_INVALID_CREDENTIALS',
      );
    }

    const locked = await login(user.email);
    expect(locked.status).toBe(429);
    expect(await errorCode(locked)).toBe('ERR_AUTH_LOGIN_LOCKED');
  });
});

describe('refresh-token rotation on PostgreSQL', () => {
  it('rotates, detects reuse of a rotated token and revokes the whole family', async () => {
    const user = await createUser();
    const first = cookieOf(await login(user.email));

    const refreshed = await post('/refresh', { cookie: first });
    expect(refreshed.status).toBe(200);
    const second = cookieOf(refreshed);
    expect(second).not.toBe(first);

    const reused = await post('/refresh', { cookie: first });
    expect(await errorCode(reused)).toBe('ERR_AUTH_REFRESH_REUSED');
    const newest = await post('/refresh', { cookie: second });
    expect(await errorCode(newest)).toBe('ERR_AUTH_REFRESH_INVALID');

    const tokens = await db
      .select()
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.userId, user.id));
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it('lets exactly one of two concurrent refreshes with the same token win (row lock)', async () => {
    const user = await createUser();
    const cookie = cookieOf(await login(user.email));

    const results = await Promise.all([post('/refresh', { cookie }), post('/refresh', { cookie })]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
  });
});
