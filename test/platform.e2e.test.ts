import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { appConfig, httpConfig } from '../src/config';

/**
 * createApp() pipeline (plan appendix L10) with the test configuration: CORS disabled,
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
    const res = await app.request(`${appConfig.API_PREFIX}/users`, {
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
});
