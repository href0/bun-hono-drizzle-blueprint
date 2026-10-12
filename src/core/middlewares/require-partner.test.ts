import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { uniqueSymbol } from 'hono-openapi';
import { setAuthenticatedPartner } from '../context/request-context';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';
import { requirePartner } from './require-partner';

/** A route behind a stand-in for partnerAuth() that verifies the partner named in a test header. */
const buildApp = (): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.use('*', async (c, next) => {
    const code = c.req.header('x-test-partner');
    if (code) setAuthenticatedPartner({ code });
    await next();
  });
  app.get('/only-acme', requirePartner('acme', 'acme-staging'), (c) => c.text('ok'));
  app.onError(globalErrorHandler);
  return app;
};

const codeOf = async (res: Response): Promise<string> =>
  `${String(res.status)} ${((await res.json()) as { error?: { code: string } }).error?.code ?? 'ok'}`;

describe('requirePartner', () => {
  const app = buildApp();

  it('lets the listed partners through', async () => {
    for (const code of ['acme', 'acme-staging']) {
      const res = await app.request('/only-acme', { headers: { 'x-test-partner': code } });
      expect(res.status).toBe(200);
    }
  });

  it('refuses any other partner with 403 ERR_PARTNER_ROUTE_FORBIDDEN', async () => {
    const res = await app.request('/only-acme', { headers: { 'x-test-partner': 'other' } });
    expect(await codeOf(res)).toBe('403 ERR_PARTNER_ROUTE_FORBIDDEN');
  });

  it('answers 401 when no partner was verified', async () => {
    expect(await codeOf(await app.request('/only-acme'))).toBe('401 ERR_UNAUTHORIZED');
  });

  it('documents its 403 in OpenAPI', () => {
    const middleware = requirePartner('acme') as unknown as Record<symbol, unknown>;
    expect(middleware[uniqueSymbol]).toEqual({
      spec: { responses: { 403: expect.any(Object) } },
    });
  });
});
