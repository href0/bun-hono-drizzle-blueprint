import { describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createDemoPayWebhook, signDemoPayWebhook } from './demo-pay.webhook';

const SECRET = 'whsec_demo_pay_test';
const NOW_MS = 1_760_000_000_000;
const NOW_S = String(NOW_MS / 1000);
const BODY = '{"id":"evt_1","type":"payment.succeeded"}';

const verifier = createDemoPayWebhook({
  DEMO_PAY_WEBHOOK_SECRET: SECRET,
  DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS: 300,
});

const verify = (
  headers: Record<string, string>,
  body: string = BODY,
  nowMs: number = NOW_MS,
  vendor = verifier,
): boolean =>
  vendor.verify({
    body: new TextEncoder().encode(body),
    header: (name) => new Map(Object.entries(headers)).get(name),
    nowMs,
  });

const signed = (timestamp = NOW_S, body = BODY, secret = SECRET): Record<string, string> => ({
  'x-demo-pay-timestamp': timestamp,
  'x-demo-pay-signature': signDemoPayWebhook(secret, timestamp, body),
});

describe('Demo Pay webhook verifier', () => {
  it('signs "<timestamp>.<raw body>" with HMAC-SHA256 (independent computation)', () => {
    const expected = createHmac('sha256', SECRET).update(`${NOW_S}.${BODY}`).digest('hex');
    expect(signDemoPayWebhook(SECRET, NOW_S, BODY)).toBe(`v1=${expected}`);
  });

  it('accepts a correctly signed, fresh webhook', () => {
    expect(verifier.vendor).toBe('demo-pay');
    expect(verify(signed())).toBe(true);
    expect(verify(signed(String(NOW_MS / 1000 - 300)))).toBe(true);
  });

  it('refuses a changed body, another secret, a missing or malformed header', () => {
    expect(verify(signed(), '{"id":"evt_2","type":"payment.succeeded"}')).toBe(false);
    expect(verify(signed(NOW_S, BODY, 'another-secret'))).toBe(false);
    expect(verify({ 'x-demo-pay-timestamp': NOW_S })).toBe(false);
    expect(verify({ ...signed(), 'x-demo-pay-timestamp': 'yesterday' })).toBe(false);
    expect(verify({ ...signed(), 'x-demo-pay-signature': 'v0=abc' })).toBe(false);
  });

  it('refuses a timestamp outside the tolerance (replayed old webhook)', () => {
    expect(verify(signed(String(NOW_MS / 1000 - 301)))).toBe(false);
    expect(verify(signed(String(NOW_MS / 1000 + 301)))).toBe(false);
  });

  it('refuses everything when no secret is configured (example disabled, fail-closed)', () => {
    const disabled = createDemoPayWebhook({
      DEMO_PAY_WEBHOOK_SECRET: '',
      DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS: 300,
    });
    expect(verify(signed(NOW_S, BODY, ''), BODY, NOW_MS, disabled)).toBe(false);
  });
});
