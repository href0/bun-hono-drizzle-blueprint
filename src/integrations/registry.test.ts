import { describe, expect, it } from 'bun:test';
import { INTEGRATION_REGISTRY } from './registry';

describe('INTEGRATION_REGISTRY', () => {
  const entries = Object.entries(INTEGRATION_REGISTRY);

  it('should use each key as the integration code (error.origin)', () => {
    for (const [key, integration] of entries) {
      expect<string>(integration.code).toBe(key);
      expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('should name every institution, each one only once', () => {
    const names = entries.map(([, integration]) => integration.institution);

    expect(names.every((name) => name.trim().length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});
