import { describe, expect, it } from 'bun:test';
import type { IntegrationIdentity } from '../core/errors';
import { INTEGRATION_REGISTRY } from './registry';

describe('INTEGRATION_REGISTRY', () => {
  // Typed, not inferred: a new project starts with an empty registry (`bun run setup` removes the
  // examples), where `Object.entries({})` would be `[string, unknown][]`.
  const entries: [string, IntegrationIdentity][] = Object.entries(INTEGRATION_REGISTRY);

  it('should use each key as the integration code (error.origin)', () => {
    for (const [key, integration] of entries) {
      expect<string>(integration.code).toBe(key);
      expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('should name every vendor, each one only once', () => {
    const names = entries.map(([, integration]) => integration.vendorName);

    expect(names.every((name) => name.trim().length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});
