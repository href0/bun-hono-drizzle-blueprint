import { describe, expect, it } from 'bun:test';
import { registryProblems } from './core/security/rbac';
import { PERMISSION_REGISTRY } from './permissions';

describe('PERMISSION_REGISTRY', () => {
  it('is valid: <group>.<action> keys, unique, within the column limits, no menu. prefix', () => {
    expect(registryProblems(PERMISSION_REGISTRY)).toEqual([]);
  });

  it('collects the permissions of every module that has routes for users', () => {
    const groups = new Set(PERMISSION_REGISTRY.map((entry) => entry.group));
    expect(groups.has('users')).toBe(true);
    expect(PERMISSION_REGISTRY.map((entry) => entry.key)).toContain('users.read');
  });
});
