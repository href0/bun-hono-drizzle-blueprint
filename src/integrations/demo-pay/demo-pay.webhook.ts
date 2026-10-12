import { createHmac } from 'node:crypto';
import { demoPayConfig, type DemoPayConfig } from '../../config';
import type { WebhookVendor } from '../../core/middlewares/webhook-auth';
import { timingSafeEqualHex } from '../../utils/crypto.util';

/**
 * Example vendor webhook scheme (Stripe-like, documented by the vendor):
 * - `x-demo-pay-timestamp`: Unix epoch **seconds**;
 * - `x-demo-pay-signature`: `v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>`.
 * A real vendor documents its own scheme — implement exactly that, never a guess.
 */
export const DEMO_PAY_TIMESTAMP_HEADER = 'x-demo-pay-timestamp';
export const DEMO_PAY_SIGNATURE_HEADER = 'x-demo-pay-signature';

const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/;

const hmacHex = (secret: string, timestamp: string, body: Uint8Array): string =>
  createHmac('sha256', secret).update(`${timestamp}.`, 'utf8').update(body).digest('hex');

/** The signature header value Demo Pay would send (tests, probes, local tools). */
export const signDemoPayWebhook = (
  secret: string,
  timestamp: string,
  body: string | Uint8Array,
): string =>
  `v1=${hmacHex(secret, timestamp, typeof body === 'string' ? Buffer.from(body) : body)}`;

/** Demo Pay's webhook verifier, registered in `createApp()` (`WEBHOOK_VENDORS`). */
export const createDemoPayWebhook = (
  settings: Pick<
    DemoPayConfig,
    'DEMO_PAY_WEBHOOK_SECRET' | 'DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS'
  > = demoPayConfig,
): WebhookVendor => ({
  vendor: 'demo-pay',
  signatureHeader: DEMO_PAY_SIGNATURE_HEADER,
  verify: ({ body, header, nowMs }): boolean => {
    const secret = settings.DEMO_PAY_WEBHOOK_SECRET;
    const timestamp = header(DEMO_PAY_TIMESTAMP_HEADER) ?? '';
    const signature = SIGNATURE_PATTERN.exec(header(DEMO_PAY_SIGNATURE_HEADER) ?? '')?.at(1);
    // No secret configured = webhooks disabled: refuse everything (fail-closed).
    if (secret === '' || !TIMESTAMP_PATTERN.test(timestamp) || signature === undefined) {
      return false;
    }
    const ageSeconds = Math.abs(nowMs / 1000 - Number(timestamp));
    if (ageSeconds > settings.DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS) return false;
    return timingSafeEqualHex(hmacHex(secret, timestamp, body), signature);
  },
});

export const demoPayWebhook = createDemoPayWebhook();
