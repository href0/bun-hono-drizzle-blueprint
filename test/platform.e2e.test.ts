import { describe, expect, it, spyOn } from 'bun:test';
import { createApp } from '../src/app';
import { appConfig, httpConfig } from '../src/config';
import { cacheService } from '../src/core/cache';

/**
 * createApp() pipeline (docs/standards/bootstrap.md §3) with the test configuration: CORS disabled,
 * no trusted proxy, Redis never connected (the rate limit fails open).
 */
describe('Platform hardening — createApp() pipeline', () => {
  const app = createApp();

  it('sets security headers on every response', async () => {
    const res = await app.request('/');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('sends no CORS headers while CORS_ORIGINS is empty', async () => {
    expect(httpConfig.CORS_ORIGINS).toEqual([]);
    const res = await app.request('/', { headers: { Origin: 'https://app.example.com' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects a body over HTTP_BODY_LIMIT_BYTES with 413 before reaching the route', async () => {
    const res = await app.request(`${appConfig.API_BASE_PATH}/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'x'.repeat(httpConfig.HTTP_BODY_LIMIT_BYTES) }),
    });

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ERR_PAYLOAD_TOO_LARGE');
    expect(res.headers.get('X-Request-ID')).toBeTruthy();
  });

  it('lets requests through when Redis is unavailable (rate limit fails open)', async () => {
    for (let i = 0; i <= httpConfig.RATE_LIMIT_MAX; i += 1) {
      const res = await app.request('/');
      expect(res.status).toBe(200);
    }
    const res = await app.request('/');
    expect(res.headers.get('RateLimit-Limit')).toBeNull();
  });

  it('self-authenticated prefixes skip the global limit; per IP only their refused attempts count', async () => {
    const counted: string[] = [];
    const increment = spyOn(cacheService, 'increment').mockImplementation((key) => {
      counted.push(key.split(':').slice(0, 2).join(':'));
      return Promise.resolve({ count: 1, ttlSeconds: 60 });
    });
    const get = spyOn(cacheService, 'get').mockResolvedValue(null);
    const inbound = [`${appConfig.API_BASE_PATH}/webhooks/unknown-vendor`];
    // partner:start
    inbound.push(`${appConfig.API_BASE_PATH}/v1/partner/ping`);
    // partner:end
    try {
      expect((await app.request('/')).status).toBe(200);
      for (const path of inbound) {
        expect((await app.request(path, { method: 'POST' })).status).toBe(401);
      }
    } finally {
      increment.mockRestore();
      get.mockRestore();
    }

    expect(counted).toEqual([
      'rate-limit:global',
      ...inbound.map(() => 'rate-limit:inbound-rejected'),
    ]);
  });
});
