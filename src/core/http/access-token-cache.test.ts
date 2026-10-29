import { describe, expect, it } from 'bun:test';
import { AccessTokenCache, type IssuedAccessToken } from './access-token-cache';
import { ExternalServiceError } from '../errors/external.error';

const VENDOR = { code: 'TEST_VENDOR', vendorName: 'Test Vendor Ltd.' };

/** A vendor login that issues `token-1`, `token-2`, … and counts how often it ran. */
const fakeLogin = (expiresInSeconds = 3600, delayMs = 10) => {
  const state = { calls: 0 };
  const login = async (): Promise<IssuedAccessToken> => {
    state.calls += 1;
    const accessToken = `token-${String(state.calls)}`;
    await Bun.sleep(delayMs);
    return { accessToken, expiresInSeconds };
  };
  return { state, login };
};

const clock = (startMs = 1_000_000) => {
  const time = { ms: startMs };
  return { time, now: () => time.ms };
};

/** Awaits a promise expected to reject and returns the reason (Bun types `.rejects` as void). */
const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
};

const vendorError = (vendorStatus?: number): ExternalServiceError =>
  new ExternalServiceError('ERROR', 'Vendor error', { integration: VENDOR, vendorStatus });

describe('AccessTokenCache', () => {
  it('should log in once for 10 parallel requests with an empty cache (single-flight)', async () => {
    const { state, login } = fakeLogin();
    const cache = new AccessTokenCache({ login });

    const tokens = await Promise.all(Array.from({ length: 10 }, () => cache.getToken()));

    expect(state.calls).toBe(1);
    expect(new Set(tokens)).toEqual(new Set(['token-1']));
  });

  it('should reuse the token until expires_in minus the margin, then log in again', async () => {
    const { state, login } = fakeLogin(3600);
    const { time, now } = clock();
    const cache = new AccessTokenCache({ login, now, refreshMarginSeconds: 60 });

    expect(await cache.getToken()).toBe('token-1');
    time.ms += (3600 - 60) * 1000 - 1;
    expect(await cache.getToken()).toBe('token-1');
    time.ms += 1;
    expect(await cache.getToken()).toBe('token-2');
    expect(state.calls).toBe(2);
  });

  it('should default the margin to 60 seconds', async () => {
    const { login } = fakeLogin(3600);
    const { time, now } = clock();
    const cache = new AccessTokenCache({ login, now });

    await cache.getToken();
    time.ms += 3540 * 1000 - 1;
    expect(await cache.getToken()).toBe('token-1');
    time.ms += 1;
    expect(await cache.getToken()).toBe('token-2');
  });

  it('should keep a short-lived token for half its lifetime instead of never reusing it', async () => {
    const { login } = fakeLogin(30);
    const { time, now } = clock();
    const cache = new AccessTokenCache({ login, now, refreshMarginSeconds: 60 });

    await cache.getToken();
    time.ms += 15 * 1000 - 1;
    expect(await cache.getToken()).toBe('token-1');
    time.ms += 1;
    expect(await cache.getToken()).toBe('token-2');
  });

  it.each([0, -5, Number.NaN])('should not cache a token with expires_in %p', async (expiresIn) => {
    const { state, login } = fakeLogin(expiresIn);
    const cache = new AccessTokenCache({ login });

    expect(await cache.getToken()).toBe('token-1');
    expect(await cache.getToken()).toBe('token-2');
    expect(state.calls).toBe(2);
  });

  it('should hand a failed login to every waiter, cache nothing and retry on the next call', async () => {
    let calls = 0;
    const cache = new AccessTokenCache({
      login: async () => {
        calls += 1;
        await Bun.sleep(5);
        if (calls === 1) throw vendorError(500);
        return { accessToken: 'token-ok', expiresInSeconds: 3600 };
      },
    });

    const results = await Promise.allSettled([
      cache.getToken(),
      cache.getToken(),
      cache.getToken(),
    ]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(await cache.getToken()).toBe('token-ok');
    expect(calls).toBe(2);
  });

  it('should log in again and retry once when the vendor answers 401', async () => {
    const { state, login } = fakeLogin();
    const cache = new AccessTokenCache({ login });
    const used: string[] = [];

    const result = await cache.withToken(async (token) => {
      used.push(token);
      if (token === 'token-1') throw vendorError(401);
      return 'data';
    });

    expect(result).toBe('data');
    expect(used).toEqual(['token-1', 'token-2']);
    expect(state.calls).toBe(2);
  });

  it('should throw a second 401 and any other failure without retrying', async () => {
    const { state, login } = fakeLogin();
    const cache = new AccessTokenCache({ login });

    expect(
      await rejectionOf(cache.withToken(async () => Promise.reject(vendorError(401)))),
    ).toBeInstanceOf(ExternalServiceError);
    expect(state.calls).toBe(2);

    let attempts = 0;
    const serverError = cache.withToken(async () => {
      attempts += 1;
      return Promise.reject(vendorError(500));
    });
    expect(await rejectionOf(serverError)).toBeInstanceOf(ExternalServiceError);
    expect(attempts).toBe(1);

    expect(
      await rejectionOf(cache.withToken(async () => Promise.reject(new TypeError('bug')))),
    ).toBeInstanceOf(TypeError);
    expect(state.calls).toBe(2);
  });

  it('should not drop a newer token when an old one is invalidated', async () => {
    const { login } = fakeLogin();
    const cache = new AccessTokenCache({ login });

    const first = await cache.getToken();
    cache.invalidate(first);
    const second = await cache.getToken();
    cache.invalidate(first); // a late 401 for the old token

    expect(await cache.getToken()).toBe(second);
  });
});
