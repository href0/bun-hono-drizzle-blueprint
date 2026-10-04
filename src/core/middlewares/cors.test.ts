import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { corsMiddleware } from './cors';

const buildApp = (origins: readonly string[]): Hono => {
  const app = new Hono();
  app.use('*', corsMiddleware(origins));
  app.get('/data', (c) => c.text('ok'));
  return app;
};

const preflight = (origin: string): RequestInit => ({
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'PATCH',
    'Access-Control-Request-Headers': 'Content-Type, Authorization',
  },
});

describe('corsMiddleware', () => {
  const app = buildApp(['https://app.example.com']);

  it('answers a preflight from a listed origin with credentials allowed', async () => {
    const res = await app.request('/data', preflight('https://app.example.com'));

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('600');
  });

  it('gives an unlisted origin no Access-Control-Allow-Origin (browser blocks it)', async () => {
    const res = await app.request('/data', preflight('https://evil.example.net'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const simple = await app.request('/data', { headers: { Origin: 'https://evil.example.net' } });
    expect(simple.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('exposes the request ID and rate-limit headers to browser code', async () => {
    const res = await app.request('/data', { headers: { Origin: 'https://app.example.com' } });
    expect(res.headers.get('Access-Control-Expose-Headers')?.split(',')).toEqual([
      'X-Request-ID',
      'Retry-After',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ]);
  });

  it('"*" reflects the caller origin (never a literal * with credentials)', async () => {
    const res = await buildApp(['*']).request('/data', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('sends no Access-Control-Allow-Origin without an Origin header', async () => {
    const res = await buildApp(['*']).request('/data');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
