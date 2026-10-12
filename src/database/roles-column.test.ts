import { describe, expect, it } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { DEFAULT_ROLE, ROLES } from '../core/security/roles';
import { users } from './schema';

/**
 * `ROLES` lives in core and the schema may not import it (strict-schema-isolation), so the
 * `users.role` column is checked against it here.
 */
describe('users.role column ↔ ROLES', () => {
  const column = getTableConfig(users).columns.find((candidate) => candidate.name === 'role');

  it('defaults to DEFAULT_ROLE, which is one of ROLES', () => {
    expect(column?.notNull).toBe(true);
    expect(column?.default).toBe(DEFAULT_ROLE);
    expect(ROLES).toContain(DEFAULT_ROLE);
  });

  it('is long enough for every role', () => {
    const length = (column as { length?: number } | undefined)?.length ?? 0;

    expect(column?.getSQLType()).toBe(`varchar(${String(length)})`);
    for (const role of ROLES) {
      expect(role.length).toBeLessThanOrEqual(length);
    }
  });
});
