import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type { CacheService, CounterState } from '../cache';
import { globalErrorHandler } from './error-handler';
import { isUnderPath, rateLimit, type RateLimitOptions } from './rate-limit';
import { requestContextMiddleware } from './request-context';

/** Counts per key like the Redis script; `down` simulates an unavailable Redis. */
const fakeCache = (options: { down?: boolean; ttl?: number } = {}) => {
  const counts = new Map<string, number>();
  const cache = {
    keys: counts,
    increment: async (key: string, windowSeconds: number): Promise<CounterState | null> => {
      if (options.down) return null;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { count, ttlSeconds: options.ttl ?? windowSeconds };
    },
  };
  return cache as unknown as CacheService & typeof cache;
};

const buildApp = (options: Partial<RateLimitOptions> & { cache: CacheService }): Hono => {
  const app = new Hono();
  // One trusted proxy, so tests choose the client IP through X-Forwarded-For.
  app.use('*', requestContextMiddleware({ trustProxyHops: 1 }));
  app.use('*', rateLimit({ windowSeconds: 60, max: 2, keyPrefix: 'global', ...options }));
  app.get('/ping', (c) => c.text('pong'));
  app.get('/health', (c) => c.text('ok'));
  app.onError(globalErrorHandler);
  return app;
};

const from = (ip: string): RequestInit => ({ headers: { 'X-Forwarded-For': ip } });

describe('rateLimit', () => {
  it('sends RateLimit-* headers while under the limit', async () => {
    const app = buildApp({ cache: fakeCache() });
    const res = await app.request('/ping', from('203.0.113.7'));

    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('2');
    expect(res.headers.get('RateLimit-Remaining')).toBe('1');
    expect(res.headers.get('RateLimit-Reset')).toBe('60');
  });

  it('rejects request max+1 with 429, Retry-After and the standard envelope', async () => {
    const app = buildApp({ cache: fakeCache({ ttl: 42 }) });
    await app.request('/ping', from('203.0.113.7'));
    await app.request('/ping', from('203.0.113.7'));
    const res = await app.request('/ping', from('203.0.113.7'));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(res.headers.get('RateLimit-Remaining')).toBe('0');
    const body = (await res.json()) as { error: { code: string; type: string } };
    expect(body.error).toMatchObject({ code: 'ERR_RATE_LIMITED', type: 'TOO_MANY_REQUESTS' });
  });

  it('counts each client IP and each keyPrefix separately', async () => {
    const cache = fakeCache();
    const app = buildApp({ cache });
    await app.request('/ping', from('203.0.113.7'));
    await app.request('/ping', from('203.0.113.7'));

    expect((await app.request('/ping', from('198.51.100.4'))).status).toBe(200);
    expect([...cache.keys.keys()].sort()).toEqual([
      'rate-limit:global:198.51.100.4',
      'rate-limit:global:203.0.113.7',
    ]);
  });

  it('fails open: passes without headers when Redis is unavailable', async () => {
    const app = buildApp({ cache: fakeCache({ down: true }), max: 0 });
    const res = await app.request('/ping', from('203.0.113.7'));

    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBeNull();
  });

  it('skips requests matched by skip()', async () => {
    const cache = fakeCache();
    const app = buildApp({ cache, max: 0, skip: (c) => c.req.path === '/health' });

    expect((await app.request('/health')).status).toBe(200);
    expect(cache.keys.size).toBe(0);
    expect((await app.request('/ping')).status).toBe(429);
  });

  it('isUnderPath matches the prefix and its sub-paths on segment boundaries only', async () => {
    const cache = fakeCache();
    const app = new Hono();
    app.use(
      '*',
      rateLimit({ windowSeconds: 60, max: 0, keyPrefix: 'g', cache, skip: isUnderPath('/health') }),
    );
    app.get('*', (c) => c.text('ok'));
    app.onError(globalErrorHandler);

    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/health/readiness')).status).toBe(200);
    expect((await app.request('/healthz')).status).toBe(429);
    expect((await app.request('/health-records')).status).toBe(429);
  });

  it('falls back to the window length when Redis reports no TTL', async () => {
    const app = buildApp({ cache: fakeCache({ ttl: -1 }) });
    const res = await app.request('/ping', from('203.0.113.7'));
    expect(res.headers.get('RateLimit-Reset')).toBe('60');
  });
});
