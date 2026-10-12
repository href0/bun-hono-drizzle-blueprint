import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { InternalServerError, UnauthorizedError } from '../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

/** The full flows run in test/auth.e2e.test.ts; this covers the controller's own branches. */
const appWith = (service: Partial<AuthService>): Hono => {
  const controller = new AuthController(service as AuthService);
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.post('/refresh', controller.refresh);
  app.onError(globalErrorHandler);
  return app;
};

const refresh = (app: Hono) =>
  app.request('/refresh', { method: 'POST', headers: { Cookie: 'refresh_token=abc' } });

describe('AuthController.refresh', () => {
  it('clears the cookie when the token is rejected (401)', async () => {
    const res = await refresh(appWith({ refresh: () => Promise.reject(new UnauthorizedError()) }));

    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toStartWith('refresh_token=; Max-Age=0;');
  });

  it('keeps the cookie on other failures, so an outage does not log the user out', async () => {
    const res = await refresh(
      appWith({ refresh: () => Promise.reject(new InternalServerError('database down')) }),
    );

    expect(res.status).toBe(500);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('passes the cookie value and the User-Agent to the service', async () => {
    const calls: unknown[][] = [];
    const app = appWith({
      refresh: (...args: unknown[]) => {
        calls.push(args);
        return Promise.reject(new UnauthorizedError());
      },
    });

    await app.request('/refresh', {
      method: 'POST',
      headers: { Cookie: 'refresh_token=abc', 'User-Agent': 'probe/1.0' },
    });

    expect(calls).toEqual([['abc', { userAgent: 'probe/1.0' }]]);
  });
});
