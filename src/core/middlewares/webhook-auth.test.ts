import { describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { getActor } from '../context/request-context';
import { logger } from '../logger';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';
import { getValidatedBody, validate } from './validate';
import {
  currentWebhook,
  requireVerifiedWebhook,
  webhookAuth,
  type WebhookRequest,
  type WebhookVendor,
} from './webhook-auth';

const seen: WebhookRequest[] = [];
const vendor: WebhookVendor = {
  vendor: 'acme-pay',
  signatureHeader: 'x-acme-signature',
  verify: (request) => {
    seen.push(request);
    return request.header('x-acme-signature') === 'valid';
  },
};

const buildApp = (vendors: WebhookVendor[] = [vendor]): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  for (const entry of vendors)
    app.use(
      `/webhooks/${entry.vendor}/*`,
      webhookAuth(entry, () => 42),
    );
  app.use('/webhooks/*', requireVerifiedWebhook());
  app.post(
    '/webhooks/acme-pay',
    validate({ body: z.object({ eventId: z.string() }), bodyKeys: 'verbatim' }),
    (c) =>
      c.json({
        vendor: currentWebhook().vendor,
        actor: getActor(),
        body: getValidatedBody<unknown>(c),
      }),
  );
  app.post('/webhooks/unverified-vendor', (c) => c.text('should never be reached'));
  app.onError(globalErrorHandler);
  return app;
};

const send = (app: Hono, path: string, signature?: string): Promise<Response> =>
  Promise.resolve(
    app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signature === undefined ? {} : { 'x-acme-signature': signature }),
      },
      body: JSON.stringify({ eventId: 'evt_1' }),
    }),
  );

const codeOf = async (res: Response): Promise<string> =>
  `${String(res.status)} ${((await res.json()) as { error?: { code: string } }).error?.code ?? 'ok'}`;

describe('webhookAuth', () => {
  it('passes a verified request as webhook:<vendor>; the handler still reads the body', async () => {
    seen.length = 0;
    const res = await send(buildApp(), '/webhooks/acme-pay', 'valid');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      vendor: 'acme-pay',
      actor: 'webhook:acme-pay',
      body: { eventId: 'evt_1' },
    });
    // The verifier saw the raw bytes exactly as sent, and the injected clock.
    expect(new TextDecoder().decode(seen.at(0)?.body)).toBe('{"eventId":"evt_1"}');
    expect(seen.at(0)?.nowMs).toBe(42);
  });

  it('rejects a missing or wrong signature with 401 ERR_WEBHOOK_SIGNATURE_INVALID', async () => {
    const app = buildApp();
    expect(await codeOf(await send(app, '/webhooks/acme-pay'))).toBe(
      '401 ERR_WEBHOOK_SIGNATURE_INVALID',
    );
    expect(await codeOf(await send(app, '/webhooks/acme-pay', 'forged'))).toBe(
      '401 ERR_WEBHOOK_SIGNATURE_INVALID',
    );
  });
});

describe('requireVerifiedWebhook (fail-closed prefix)', () => {
  it('a webhook route without a verifier, or an unknown vendor path, is 401 — never public', async () => {
    const app = buildApp();
    expect(await codeOf(await send(app, '/webhooks/unverified-vendor', 'valid'))).toBe(
      '401 ERR_WEBHOOK_SIGNATURE_INVALID',
    );
    expect(await codeOf(await send(app, '/webhooks/nobody', 'valid'))).toBe(
      '401 ERR_WEBHOOK_SIGNATURE_INVALID',
    );
  });

  it('a vendor whose verifier is not registered cannot be reached even with a valid signature', async () => {
    expect(await codeOf(await send(buildApp([]), '/webhooks/acme-pay', 'valid'))).toBe(
      '401 ERR_WEBHOOK_SIGNATURE_INVALID',
    );
  });
});

describe('webhook audit log', () => {
  const entries = (spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] =>
    spy.mock.calls
      .map((call) => call.at(0) as Record<string, unknown>)
      .filter((entry) => entry.audit === 'webhook');

  it('logs one accepted line with the handler status, one rejected line with the reason', async () => {
    const info = spyOn(logger, 'info');
    const warn = spyOn(logger, 'warn');
    try {
      const app = buildApp();
      await send(app, '/webhooks/acme-pay', 'valid');
      await send(app, '/webhooks/acme-pay', 'forged');
      await send(app, '/webhooks/nobody', 'valid');

      expect(entries(info)).toEqual([
        expect.objectContaining({
          outcome: 'accepted',
          vendor: 'acme-pay',
          statusCode: 200,
          path: '/webhooks/acme-pay',
        }),
      ]);
      expect(entries(warn)).toEqual([
        expect.objectContaining({
          outcome: 'rejected',
          reason: 'signature_invalid',
          statusCode: 401,
        }),
        expect.objectContaining({ outcome: 'rejected', reason: 'no_verifier', vendor: undefined }),
      ]);
      expect(JSON.stringify(entries(warn))).not.toContain('forged');
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });

  it('logs the error status when the handler fails after verification', async () => {
    const info = spyOn(logger, 'info');
    try {
      const app = buildApp();
      await app.request('/webhooks/acme-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-acme-signature': 'valid' },
        body: JSON.stringify({ wrong: true }),
      });
      expect(entries(info).at(0)).toMatchObject({ outcome: 'accepted', statusCode: 400 });
    } finally {
      info.mockRestore();
    }
  });
});

describe('currentWebhook', () => {
  it('is 401 outside webhookAuth()', async () => {
    const app = new Hono();
    app.use('*', requestContextMiddleware());
    app.get('/x', (c) => c.text(currentWebhook().vendor));
    app.onError(globalErrorHandler);

    expect(await codeOf(await app.request('/x'))).toBe('401 ERR_UNAUTHORIZED');
  });
});
