import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { setAuthenticatedPartner } from '../../core/context/request-context';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import { partnerGatewayRoutes } from './partner-gateway.partner.routes';

/** The routes behind a stand-in for partnerAuth() (signing itself: partner-auth.test.ts). */
const buildApp = (verified: boolean): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.use('*', async (_c, next) => {
    if (verified) setAuthenticatedPartner({ code: 'acme' });
    await next();
  });
  app.route('/partner', partnerGatewayRoutes);
  app.onError(globalErrorHandler);
  return app;
};

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('PartnerGatewayController', () => {
  it('ping answers with the verified partner and the server time', async () => {
    const res = await buildApp(true).request('/partner/ping');
    const body = (await res.json()) as { data: { partner_code: string; server_time: string } };

    expect(res.status).toBe(200);
    expect(body.data.partner_code).toBe('acme');
    expect(body.data.server_time).toMatch(ISO_INSTANT);
  });

  it('echo returns the validated message', async () => {
    const res = await buildApp(true).request('/partner/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'halo' }),
    });
    const body = (await res.json()) as { data: { partner_code: string; message: string } };

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ partner_code: 'acme', message: 'halo' });
  });

  it('echo validates its body (400) and both need a verified partner (401)', async () => {
    const invalid = await buildApp(true).request('/partner/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    expect(invalid.status).toBe(400);

    expect((await buildApp(false).request('/partner/ping')).status).toBe(401);
  });
});
