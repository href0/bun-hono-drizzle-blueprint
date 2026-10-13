import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { setAuthenticatedWebhook } from '../../core/context/request-context';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import { paymentNotificationsService } from './payment-notifications.service';
import { paymentNotificationWebhookRoutes } from './payment-notifications.webhook.routes';

/** The routes behind a stand-in for webhookAuth() (signatures: webhook-auth.test.ts, e2e). */
const app = new Hono();
app.use('*', requestContextMiddleware());
app.use('*', async (_c, next) => {
  setAuthenticatedWebhook({ vendor: 'demo-pay' });
  await next();
});
app.route('/', paymentNotificationWebhookRoutes);
app.onError(globalErrorHandler);

const payload = {
  id: 'evt_1',
  type: 'payment.succeeded',
  data: { paymentId: 'pay_1', status: 'succeeded', amount: 150000, currency: 'IDR' },
};

const post = (body: unknown): Promise<Response> =>
  Promise.resolve(
    app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('PaymentNotificationsWebhookController', () => {
  const calls: unknown[][] = [];
  let receive: ReturnType<typeof spyOn>;

  beforeAll(() => {
    receive = spyOn(paymentNotificationsService, 'receive').mockImplementation(
      async (vendor, notification) => {
        calls.push([vendor, notification]);
        return { received: true, duplicate: calls.length > 1 };
      },
    );
  });

  afterAll(() => {
    receive.mockRestore();
  });

  it('passes the camelCase vendor payload as sent, with the verified vendor; 200 both times', async () => {
    const first = await post(payload);
    const retry = await post(payload);

    expect(first.status).toBe(200);
    expect(((await first.json()) as { data: unknown }).data).toEqual({
      received: true,
      duplicate: false,
    });
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { data: unknown }).data).toEqual({
      received: true,
      duplicate: true,
    });
    expect(calls.at(0)).toEqual(['demo-pay', payload]);
  });

  it('keeps the vendor fields it does not use (the stored event is the whole event)', async () => {
    const extended = {
      ...payload,
      id: 'evt_2',
      livemode: false,
      data: { ...payload.data, customerRef: 'cus_9' },
    };
    expect((await post(extended)).status).toBe(200);
    expect(calls.at(-1)).toEqual(['demo-pay', extended]);
  });

  it('rejects a payload that does not match the vendor contract with 400', async () => {
    const res = await post({ ...payload, data: { ...payload.data, status: 'unknown' } });
    expect(res.status).toBe(400);
  });
});
