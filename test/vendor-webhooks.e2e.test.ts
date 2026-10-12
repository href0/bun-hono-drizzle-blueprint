import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { createApp } from '../src/app';
import { appConfig } from '../src/config';
import { signDemoPayWebhook } from '../src/integrations/demo-pay/demo-pay.webhook';
import { paymentNotificationsService } from '../src/modules/payment-notifications/payment-notifications.service';
import { nowInstant } from '../src/utils/datetime.util';
import { HERMETIC_ENV } from './setup/hermetic-env';

/**
 * Vendor webhooks through createApp(): the Demo Pay verifier on <base>/webhooks/demo-pay, the
 * fail-closed guard on the whole prefix, and the payload reaching the module in the vendor's own
 * casing. The service is spied (no database); its idempotency is unit-tested.
 */

const URL_PATH = `${appConfig.API_BASE_PATH}/webhooks/demo-pay`;
const SECRET = HERMETIC_ENV.DEMO_PAY_WEBHOOK_SECRET;
const payload = JSON.stringify({
  id: 'evt_e2e_1',
  type: 'payment.succeeded',
  data: { paymentId: 'pay_1', status: 'succeeded', amount: 150000, currency: 'IDR' },
});

const signedRequest = (body: string, secret: string = SECRET, ageSeconds = 0): RequestInit => {
  const timestamp = String(Math.floor(nowInstant().epochMilliseconds / 1000) - ageSeconds);
  return {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'x-demo-pay-timestamp': timestamp,
      'x-demo-pay-signature': signDemoPayWebhook(secret, timestamp, body),
    },
  };
};

const codeOf = async (res: Response): Promise<string> =>
  `${String(res.status)} ${((await res.json()) as { error?: { code: string } }).error?.code ?? 'ok'}`;

describe('Vendor webhooks — E2E through createApp()', () => {
  const app = createApp();
  const received: unknown[][] = [];
  let receive: ReturnType<typeof spyOn>;

  beforeAll(() => {
    receive = spyOn(paymentNotificationsService, 'receive').mockImplementation(
      async (vendor, notification) => {
        received.push([vendor, notification]);
        return { received: true, duplicate: false };
      },
    );
  });

  afterAll(() => {
    receive.mockRestore();
  });

  it('a correctly signed Demo Pay webhook reaches the module as webhook:demo-pay', async () => {
    const res = await app.request(URL_PATH, signedRequest(payload));

    expect(res.status).toBe(200);
    expect(received.at(-1)).toEqual(['demo-pay', JSON.parse(payload)]);
  });

  it('refuses a forged, tampered or stale webhook with 401 ERR_WEBHOOK_SIGNATURE_INVALID', async () => {
    const before = received.length;
    const tampered = signedRequest(payload);
    const cases: RequestInit[] = [
      signedRequest(payload, 'not-the-secret'),
      { ...tampered, body: payload.replace('150000', '1') },
      signedRequest(payload, SECRET, 3600),
      { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } },
    ];

    for (const init of cases) {
      expect(await codeOf(await app.request(URL_PATH, init))).toBe(
        '401 ERR_WEBHOOK_SIGNATURE_INVALID',
      );
    }
    expect(received.length).toBe(before);
  });
});
