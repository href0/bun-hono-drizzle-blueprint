import { describe, expect, it } from 'bun:test';
import { getTableConfig, getViewConfig } from 'drizzle-orm/pg-core';
import { db } from '../connection';
import { users } from './domain/users.schema';
import { refRoles } from './reference/ref-roles.schema';
import { referenceSchema } from './schemas';

describe('table layout (plan D14)', () => {
  it('keeps project tables in the default public schema (a project owns its database)', () => {
    expect(getTableConfig(users).schema).toBeUndefined();
  });
});

describe('reference data', () => {
  it('is an existing view in the reference schema (never created or migrated by drizzle-kit)', () => {
    const config = getViewConfig(refRoles);
    expect(config.schema).toBe(referenceSchema.schemaName);
    expect(config.isExisting).toBe(true);
  });

  it('is read-only at compile time', () => {
    // Never executed: the assertion is the @ts-expect-error — inserting into a view must not
    // type-check. If it ever compiles, tsc fails on the unused directive.
    const insertIntoReferenceView = (): unknown =>
      // @ts-expect-error views cannot be inserted into
      db.insert(refRoles);
    expect(typeof insertIntoReferenceView).toBe('function');
  });
});
