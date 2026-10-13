import { describe, expect, it } from 'bun:test';
import { buildDemoPayConfig } from './demo-pay.config';

// Example webhook vendor: removed with it by `bun run setup <name>` unless --keep-examples.
describe('demo-pay config (Unit)', () => {
  it('demo-pay: an empty secret is allowed (webhooks disabled), the tolerance must be positive', () => {
    expect(buildDemoPayConfig({})).toEqual({
      DEMO_PAY_WEBHOOK_SECRET: '',
      DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS: 300,
    });
    expect(() => buildDemoPayConfig({ DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS: '0' })).toThrow(
      'DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS',
    );
  });
});
