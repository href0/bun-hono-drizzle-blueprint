import { describe, expect, it } from 'bun:test';
import { isSensitiveKey, summarizeVendorBody, VENDOR_BODY_LOG_LIMIT } from './vendor-body';

describe('isSensitiveKey', () => {
  it.each([
    'password',
    'access_token',
    'refreshToken',
    'id_token',
    'X-Api-Key',
    'client_secret',
    'Authorization',
    'set-cookie',
    'credit_card',
    'card_number',
    'CVV',
    'pin',
    'otp',
    'NIK',
  ])('%s → redacted', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['shipping', 'footprint', 'unik_id', 'status', 'message', 'error_description'])(
    '%s → kept',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe('summarizeVendorBody', () => {
  it('should skip empty bodies', () => {
    expect([
      summarizeVendorBody(undefined),
      summarizeVendorBody(null),
      summarizeVendorBody(''),
    ]).toEqual([undefined, undefined, undefined]);
  });

  it('should redact sensitive keys at any depth, inside arrays too', () => {
    const body = {
      error: 'denied',
      data: { user: { nik: '3201', name: 'Ada' }, sessions: [{ token: 't-1' }, { token: 't-2' }] },
    };

    expect(summarizeVendorBody(body)).toBe(
      '{"error":"denied","data":{"user":{"nik":"[REDACTED]","name":"Ada"},"sessions":[{"token":"[REDACTED]"},{"token":"[REDACTED]"}]}}',
    );
  });

  it('should stop descending past the depth limit', () => {
    let body: Record<string, unknown> = { password: 'deep' };
    for (let i = 0; i < 20; i += 1) body = { next: body };

    const summary = summarizeVendorBody(body);
    expect(summary).toContain('"[…]"');
    expect(summary).not.toContain('deep');
  });

  it('should keep short text and truncate long text to the limit', () => {
    expect(summarizeVendorBody('<h1>Bad Gateway</h1>')).toBe('<h1>Bad Gateway</h1>');
    expect(summarizeVendorBody('a'.repeat(VENDOR_BODY_LOG_LIMIT))).toBe(
      'a'.repeat(VENDOR_BODY_LOG_LIMIT),
    );
    expect(summarizeVendorBody('a'.repeat(VENDOR_BODY_LOG_LIMIT + 1))).toBe(
      `${'a'.repeat(VENDOR_BODY_LOG_LIMIT)}…[truncated, ${String(VENDOR_BODY_LOG_LIMIT + 1)} chars]`,
    );
  });

  it('should truncate a large JSON body after redaction', () => {
    const summary = summarizeVendorBody({
      items: Array.from({ length: 500 }, (_, id) => ({ id })),
    });

    expect(summary?.length).toBeLessThan(VENDOR_BODY_LOG_LIMIT + 40);
    expect(summary).toContain('…[truncated,');
  });

  it('should reduce binary bodies to their size', () => {
    expect(summarizeVendorBody(new ArrayBuffer(16))).toBe('[binary, 16 bytes]');
    expect(summarizeVendorBody(Buffer.from('%PDF-1.7'))).toBe('[binary, 8 bytes]');
  });

  it('should print other primitives as text', () => {
    expect([summarizeVendorBody(42), summarizeVendorBody(false)]).toEqual(['42', 'false']);
    expect(summarizeVendorBody(Symbol('x'))).toBe('[symbol]');
  });
});
