import { afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import type { CacheService, CounterState } from '../../core/cache';
import { runWithRequestContext } from '../../core/context/request-context';
import {
  ApiError,
  APP_ERROR_CODES,
  ConflictError,
  InternalServerError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors';
import { logger } from '../../core/logger';
import { verifyAccessToken } from '../../core/security/jwt';
import { transactionStorage } from '../../database/transaction-host';
import type { User } from '../../database/schema';
import { sha256Hex } from '../../utils/crypto.util';
import { nowInstant } from '../../utils/datetime.util';
import { createAuthFakes, sampleUser } from '../../../test/helpers/auth-fakes';
import type { AuthRepository } from './auth.repository';
import type { AuthUsersRepository } from './auth-users.repository';
import { AuthService, type AuthSettings } from './auth.service';

const settings: AuthSettings = {
  REFRESH_TOKEN_TTL_SECONDS: 3600,
  REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS: 7200,
  AUTH_LOGIN_MAX_ATTEMPTS: 3,
  AUTH_LOGIN_LOCK_SECONDS: 900,
};
const PASSWORD = 'correct horse battery staple';

/** A Redis-like counter store (or a Redis that is down: `increment` → null). */
const fakeCache = (down = false): { cache: CacheService; counters: Map<string, number> } => {
  const counters = new Map<string, number>();
  const cache = {
    increment: (key: string): Promise<CounterState | null> => {
      if (down) return Promise.resolve(null);
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return Promise.resolve({ count, ttlSeconds: 600 });
    },
    del: (key: string): Promise<void> => {
      counters.delete(key);
      return Promise.resolve();
    },
  };
  return { cache: cache as unknown as CacheService, counters };
};

const setup = (users: User[], options: { cacheDown?: boolean } = {}) => {
  const fakes = createAuthFakes(users);
  const { cache, counters } = fakeCache(options.cacheDown);
  const service = new AuthService(
    fakes.tokenRepository as AuthRepository,
    fakes.usersRepository as AuthUsersRepository,
    cache,
    settings,
  );
  return { ...fakes, counters, service };
};

/** Inside a request (client IP for the brute-force key) and a joined fake transaction. */
const inRequest = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithRequestContext(
    { requestId: 'req-1', locale: 'en', clientIp: '203.0.113.7', actor: 'anonymous' },
    () => transactionStorage.run({} as never, fn),
  );

const rejection = async (promise: Promise<unknown>): Promise<ApiError> => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
};

let ada: User;
beforeAll(async () => {
  ada = sampleUser({ passwordHash: await Bun.password.hash(PASSWORD) });
});

describe('AuthService.login', () => {
  it('issues an access token for the user and stores only the hash of the refresh token', async () => {
    const { service, tokens } = setup([ada]);

    const session = await inRequest(() =>
      service.login({ email: ada.email, password: PASSWORD }, { userAgent: 'x'.repeat(300) }),
    );

    expect(session.user).toEqual({
      id: ada.id,
      email: ada.email,
      fullName: ada.fullName,
      role: 'user',
    });
    expect(await verifyAccessToken(session.accessToken.token)).toMatchObject({
      userId: ada.id,
      role: 'user',
    });
    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.refreshMaxAge).toBeGreaterThan(3590);
    expect(session.refreshMaxAge).toBeLessThanOrEqual(3600);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId: ada.id,
      tokenHash: sha256Hex(session.refreshToken),
      ip: '203.0.113.7',
      revokedAt: null,
    });
    expect(tokens[0]?.userAgent).toHaveLength(255);
    expect(JSON.stringify(tokens)).not.toContain(session.refreshToken);
  });

  it('gives the same 401 for an unknown email, a wrong password and an inactive account', async () => {
    const inactive = sampleUser({
      id: Bun.randomUUIDv7(),
      email: 'off@example.com',
      passwordHash: ada.passwordHash,
      isActive: false,
    });
    const { service, tokens } = setup([ada, inactive]);

    for (const dto of [
      { email: 'nobody@example.com', password: PASSWORD },
      { email: ada.email, password: 'wrong password' },
      { email: inactive.email, password: PASSWORD },
    ]) {
      const error = await rejection(inRequest(() => service.login(dto)));
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.errorCode).toBe(APP_ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }
    expect(tokens).toHaveLength(0);
  });

  it('locks an (email, IP) after AUTH_LOGIN_MAX_ATTEMPTS without checking the password', async () => {
    const { service } = setup([ada]);
    const attempt = (password: string) =>
      inRequest(() => service.login({ email: ada.email, password }));

    for (let i = 0; i < 3; i += 1) {
      expect((await rejection(attempt('wrong'))).errorCode).toBe(
        APP_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      );
    }
    const locked = await rejection(attempt(PASSWORD));
    expect(locked).toBeInstanceOf(TooManyRequestsError);
    expect(locked.errorCode).toBe(APP_ERROR_CODES.AUTH_LOGIN_LOCKED);
    expect((locked as TooManyRequestsError).retryAfterSeconds).toBe(600);
  });

  it('counts per normalized email and resets the counter after a successful login', async () => {
    const { service, counters } = setup([ada]);

    await rejection(
      inRequest(() => service.login({ email: ' ADA@example.com ', password: 'wrong' })),
    );
    expect([...counters.values()]).toEqual([1]);
    await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));
    expect(counters.size).toBe(0);
  });

  it('fails open when Redis is down (no lock, login still works)', async () => {
    const { service } = setup([ada], { cacheDown: true });

    const session = await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));
    expect(session.user.id).toBe(ada.id);
  });

  it('refuses a user whose role is not one of ROLES (broken invariant → 500)', async () => {
    const odd = sampleUser({ passwordHash: ada.passwordHash, role: 'superuser' });
    const { service } = setup([odd]);

    expect(
      await rejection(inRequest(() => service.login({ email: odd.email, password: PASSWORD }))),
    ).toBeInstanceOf(InternalServerError);
  });
});

describe('AuthService.refresh', () => {
  const loggedIn = async (users: User[] = [ada]) => {
    const context = setup(users);
    const session = await inRequest(() =>
      context.service.login({ email: ada.email, password: PASSWORD }),
    );
    return { ...context, session };
  };

  it('rotates: new token in the same family, old one revoked and pointing to its successor', async () => {
    const { service, tokens, session } = await loggedIn();

    const next = await inRequest(() => service.refresh(session.refreshToken));

    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect(tokens).toHaveLength(2);
    const old = tokens.at(0);
    const current = tokens.at(1);
    expect(current?.familyId).toBe(old?.familyId ?? '');
    expect(current?.familyStartedAt.equals(old?.familyStartedAt ?? nowInstant())).toBe(true);
    expect(old?.revokedAt).not.toBeNull();
    expect(old?.replacedById).toBe(current?.id ?? '');
    expect(current?.revokedAt).toBeNull();
    expect(await verifyAccessToken(next.accessToken.token)).toMatchObject({ userId: ada.id });
  });

  it('reuse of a rotated token revokes the whole family, including the newest token', async () => {
    const { service, tokens, session } = await loggedIn();
    const next = await inRequest(() => service.refresh(session.refreshToken));

    const reused = await rejection(inRequest(() => service.refresh(session.refreshToken)));

    expect(reused.errorCode).toBe(APP_ERROR_CODES.AUTH_REFRESH_REUSED);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
    // The newest token was revoked with the family (no successor): plainly invalid now.
    expect((await rejection(inRequest(() => service.refresh(next.refreshToken)))).errorCode).toBe(
      APP_ERROR_CODES.AUTH_REFRESH_INVALID,
    );
  });

  it('a token revoked by logout is invalid, not "reused" (no successor)', async () => {
    const { service, tokens, session } = await loggedIn();
    await service.logout(session.refreshToken);

    expect(
      (await rejection(inRequest(() => service.refresh(session.refreshToken)))).errorCode,
    ).toBe(APP_ERROR_CODES.AUTH_REFRESH_INVALID);
    expect(tokens).toHaveLength(1);
  });

  it('rejects a missing, unknown or expired token with ERR_AUTH_REFRESH_INVALID', async () => {
    const { service, tokens, session } = await loggedIn();
    const first = tokens.at(0);
    if (first) first.expiresAt = nowInstant().subtract({ seconds: 1 });

    for (const token of [undefined, '', 'unknown-token', session.refreshToken]) {
      expect((await rejection(inRequest(() => service.refresh(token)))).errorCode).toBe(
        APP_ERROR_CODES.AUTH_REFRESH_INVALID,
      );
    }
    expect(tokens).toHaveLength(1);
  });

  it('revokes the family of a user deactivated or deleted since login', async () => {
    for (const change of [{ isActive: false }, { deletedAt: nowInstant() }]) {
      const { service, tokens, users, session } = await loggedIn([{ ...ada }]);
      Object.assign(users[0] ?? {}, change);

      expect(
        (await rejection(inRequest(() => service.refresh(session.refreshToken)))).errorCode,
      ).toBe(APP_ERROR_CODES.AUTH_REFRESH_INVALID);
      expect(tokens.map((token) => token.revokedAt !== null)).toEqual([true]);
    }
  });

  it('never extends a session past REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS', async () => {
    const { service, tokens, session } = await loggedIn();
    const first = tokens.at(0);
    if (first) first.familyStartedAt = nowInstant().subtract({ seconds: 7000 });

    const next = await inRequest(() => service.refresh(session.refreshToken));

    // 7200 s after the family started, not 3600 s from now.
    expect(next.refreshMaxAge).toBeLessThanOrEqual(200);
    expect(next.refreshMaxAge).toBeGreaterThan(190);
  });
});

describe('AuthService logout, profile, registration', () => {
  it('logout revokes the session of the token and is idempotent', async () => {
    const other = sampleUser({
      id: Bun.randomUUIDv7(),
      email: 'other@example.com',
      passwordHash: ada.passwordHash,
    });
    const { service, tokens } = setup([ada, other]);
    const mine = await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));
    await inRequest(() => service.login({ email: other.email, password: PASSWORD }));

    await service.logout(mine.refreshToken);
    await service.logout(mine.refreshToken);
    await service.logout(undefined);
    await service.logout('unknown');

    expect(tokens.map((token) => token.revokedAt !== null)).toEqual([true, false]);
  });

  it('logoutAll revokes every session of the user only', async () => {
    const other = sampleUser({
      id: Bun.randomUUIDv7(),
      email: 'other@example.com',
      passwordHash: ada.passwordHash,
    });
    const { service, tokens } = setup([ada, other]);
    await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));
    await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));
    await inRequest(() => service.login({ email: other.email, password: PASSWORD }));

    await service.logoutAll(ada.id);

    expect(tokens.map((token) => token.revokedAt !== null)).toEqual([true, true, false]);
  });

  it('getProfile returns the user, 401 once deactivated or deleted', async () => {
    const { service, users } = setup([{ ...ada }]);

    expect(await service.getProfile(ada.id)).toEqual({
      id: ada.id,
      email: ada.email,
      fullName: ada.fullName,
      role: 'user',
    });
    Object.assign(users[0] ?? {}, { isActive: false });
    expect((await rejection(service.getProfile(ada.id))).errorCode).toBe(
      APP_ERROR_CODES.AUTH_TOKEN_INVALID,
    );
    expect((await rejection(service.getProfile(Bun.randomUUIDv7()))).errorCode).toBe(
      APP_ERROR_CODES.AUTH_TOKEN_INVALID,
    );
  });

  it('register creates an active user with a hashed password; a taken email is 409', async () => {
    const { service, users } = setup([ada]);

    const created = await inRequest(() =>
      service.register({ email: 'new@example.com', fullName: 'New User', password: 'long enough' }),
    );

    expect(created).toMatchObject({ email: 'new@example.com', role: 'user' });
    const stored = users.find((user) => user.email === 'new@example.com');
    expect(await Bun.password.verify('long enough', stored?.passwordHash ?? '')).toBe(true);
    expect(
      await rejection(
        inRequest(() =>
          service.register({ email: ada.email, fullName: 'X', password: 'long enough' }),
        ),
      ),
    ).toBeInstanceOf(ConflictError);
  });

  it('register maps a concurrent unique violation to 409', async () => {
    const { service, usersRepository } = setup([]);
    usersRepository.create = () =>
      Promise.reject(Object.assign(new Error('duplicate key'), { code: '23505' }));

    expect(
      await rejection(
        inRequest(() =>
          service.register({ email: 'race@example.com', fullName: 'R', password: 'long enough' }),
        ),
      ),
    ).toBeInstanceOf(ConflictError);
  });
});

describe('password changes end older sessions', () => {
  it('refresh refuses (and revokes) a family started before password_changed_at', async () => {
    const { service, tokens, users } = setup([{ ...ada }]);
    const session = await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));
    Object.assign(users[0] ?? {}, { passwordChangedAt: nowInstant().add({ seconds: 1 }) });

    expect(
      (await rejection(inRequest(() => service.refresh(session.refreshToken)))).errorCode,
    ).toBe(APP_ERROR_CODES.AUTH_REFRESH_INVALID);
    expect(tokens.map((token) => token.revokedAt !== null)).toEqual([true]);
  });

  it('a family started at or after the change keeps working', async () => {
    const { service, users } = setup([
      { ...ada, passwordChangedAt: nowInstant().subtract({ seconds: 5 }) },
    ]);
    const session = await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));

    expect((await inRequest(() => service.refresh(session.refreshToken))).user.id).toBe(ada.id);
    expect(users[0]?.passwordChangedAt).not.toBeNull();
  });
});

describe('AuthService.changePassword', () => {
  const NEW_PASSWORD = 'a brand new password';

  it('replaces the hash, ends every session and starts a new one for this device', async () => {
    const { service, tokens, users } = setup([{ ...ada }]);
    const other = await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));

    const session = await inRequest(() =>
      service.changePassword(ada.id, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    );

    const stored = users.at(0);
    expect(await Bun.password.verify(NEW_PASSWORD, stored?.passwordHash ?? '')).toBe(true);
    expect(stored?.passwordChangedAt).not.toBeNull();
    expect(tokens.at(0)?.revokedAt).not.toBeNull();
    expect(tokens.at(1)?.revokedAt).toBeNull();
    expect((await rejection(inRequest(() => service.refresh(other.refreshToken)))).errorCode).toBe(
      APP_ERROR_CODES.AUTH_REFRESH_INVALID,
    );
    expect((await inRequest(() => service.refresh(session.refreshToken))).user.id).toBe(ada.id);
    expect(
      (await inRequest(() => service.login({ email: ada.email, password: NEW_PASSWORD }))).user.id,
    ).toBe(ada.id);
  });

  it('a wrong current password is a 400 on current_password and counts as a login attempt', async () => {
    const { service, counters, users } = setup([{ ...ada }]);

    const error = await rejection(
      inRequest(() =>
        service.changePassword(ada.id, { currentPassword: 'wrong', newPassword: NEW_PASSWORD }),
      ),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details).toEqual([{ field: 'currentPassword', message: expect.anything() }]);
    expect([...counters.values()]).toEqual([1]);
    expect(users[0]?.passwordHash).toBe(ada.passwordHash);
    for (let i = 0; i < 2; i += 1) {
      await rejection(
        inRequest(() =>
          service.changePassword(ada.id, { currentPassword: 'wrong', newPassword: NEW_PASSWORD }),
        ),
      );
    }
    expect(
      await rejection(
        inRequest(() =>
          service.changePassword(ada.id, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
        ),
      ),
    ).toBeInstanceOf(TooManyRequestsError);
  });

  it('a deleted or deactivated caller gets 401', async () => {
    const { service } = setup([{ ...ada, isActive: false }]);

    expect(
      (
        await rejection(
          inRequest(() =>
            service.changePassword(ada.id, {
              currentPassword: PASSWORD,
              newPassword: NEW_PASSWORD,
            }),
          ),
        )
      ).errorCode,
    ).toBe(APP_ERROR_CODES.AUTH_TOKEN_INVALID);
  });
});

describe('security log events', () => {
  const spies: { mockRestore: () => void }[] = [];
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  it('logs failures with a hashed email and a reason, successes and lockouts — never the email', async () => {
    const warnings: unknown[][] = [];
    const infos: unknown[][] = [];
    spies.push(
      spyOn(logger, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(args);
      }),
      spyOn(logger, 'info').mockImplementation((...args: unknown[]) => {
        infos.push(args);
      }),
    );
    const { service } = setup([{ ...ada }]);

    await rejection(inRequest(() => service.login({ email: 'nobody@example.com', password: 'x' })));
    await rejection(inRequest(() => service.login({ email: ada.email, password: 'wrong' })));
    await inRequest(() => service.login({ email: ada.email, password: PASSWORD }));
    await service.logoutAll(ada.id);
    for (let i = 0; i < 4; i += 1) {
      await rejection(inRequest(() => service.login({ email: ada.email, password: 'wrong' })));
    }

    const emailHash = sha256Hex(ada.email);
    expect(warnings.slice(0, 2)).toEqual([
      [{ emailHash: sha256Hex('nobody@example.com'), reason: 'unknown_email' }, 'Login failed'],
      [{ emailHash, reason: 'wrong_password' }, 'Login failed'],
    ]);
    expect(warnings.at(-1)).toEqual([
      { emailHash, attempts: 4 },
      'Login locked: too many attempts',
    ]);
    expect(infos).toEqual([
      [{ userId: ada.id }, 'Login succeeded'],
      [{ userId: ada.id }, 'Logged out of every session'],
    ]);
    expect(JSON.stringify([...warnings, ...infos])).not.toContain(ada.email);
  });
});
