import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { getRequestContext } from '../../src/core/context/request-context';
import {
  globalErrorHandler,
  requestContextMiddleware,
  requirePermission,
} from '../../src/core/middlewares';
import { signedIn, TEST_PRINCIPAL_ID } from './signed-in';

const appWith = (middleware: ReturnType<typeof signedIn>): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.use('*', middleware);
  app.get('/orders', requirePermission('orders.read'), (c) =>
    c.text(getRequestContext()?.actor ?? ''),
  );
  app.onError(globalErrorHandler);
  return app;
};

describe('signedIn', () => {
  it('signs the request in as the test principal holding every permission by default', async () => {
    const res = await appWith(signedIn()).request('/orders');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`user:${TEST_PRINCIPAL_ID}`);
  });

  it('holds exactly the listed permissions otherwise', async () => {
    expect((await appWith(signedIn(['orders.read'])).request('/orders')).status).toBe(200);
    expect((await appWith(signedIn([])).request('/orders')).status).toBe(403);
  });
});
