import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { csrfProtection } from './csrf';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';

const appWith = (origins: readonly string[]): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.post('/session', csrfProtection(origins), (c) => c.text('ok'));
  app.onError(globalErrorHandler);
  return app;
};

const post = (app: Hono, headers: Record<string, string>) =>
  app.request('http://api.example.com/session', { method: 'POST', headers });

describe('csrfProtection', () => {
  const app = appWith(['https://app.example.com']);

  it('allows a listed Origin, the API’s own origin and Sec-Fetch-Site: same-origin', async () => {
    for (const headers of <Record<string, string>[]>[
      { Origin: 'https://app.example.com' },
      { Origin: 'http://api.example.com' },
      { 'Sec-Fetch-Site': 'same-origin' },
    ]) {
      expect((await post(app, headers)).status).toBe(200);
    }
  });

  it('rejects an unlisted or missing Origin on a body-less / form POST with the standard envelope', async () => {
    for (const headers of <Record<string, string>[]>[
      { Origin: 'https://evil.example' },
      {},
      { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' },
      { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' },
    ]) {
      const res = await post(app, headers);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        error: { type: 'FORBIDDEN', code: 'ERR_CSRF_ORIGIN_FORBIDDEN' },
      });
    }
  });

  it('does not check JSON requests (cross-site browsers need a CORS preflight for them)', async () => {
    const res = await post(app, {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
    });

    expect(res.status).toBe(200);
  });

  it('"*" (development) allows any origin', async () => {
    expect((await post(appWith(['*']), { Origin: 'https://anything.example' })).status).toBe(200);
  });

  it('lets errors of later handlers through unchanged', async () => {
    const failing = new Hono();
    failing.use('*', requestContextMiddleware());
    failing.post('/session', csrfProtection([]), () => {
      throw new Error('handler failure');
    });
    failing.onError(globalErrorHandler);

    const res = await failing.request('/session', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(res.status).toBe(500);
  });
});
