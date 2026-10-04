import { describe, expect, it } from 'bun:test';
import { resolveRequestId } from './request-id.util';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId (Unit)', () => {
  it('should keep a safe inbound request ID', () => {
    expect(resolveRequestId('gw-01.trace:abc_123')).toBe('gw-01.trace:abc_123');
    expect(resolveRequestId('a'.repeat(128))).toBe('a'.repeat(128));
  });

  it('should replace unsafe, empty, oversized or missing IDs with a generated one', () => {
    const generate = (): string => 'generated';

    expect(resolveRequestId('evil\nline', generate)).toBe('generated');
    expect(resolveRequestId('has space', generate)).toBe('generated');
    expect(resolveRequestId('', generate)).toBe('generated');
    expect(resolveRequestId('a'.repeat(129), generate)).toBe('generated');
    expect(resolveRequestId(undefined, generate)).toBe('generated');
  });

  it('should generate a UUID v7 by default', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_V7);
  });
});
