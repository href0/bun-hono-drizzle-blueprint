import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS = resolve(import.meta.dir, '../drizzle');
const sqlFiles = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql'));
const allSql = sqlFiles.map((file) => readFileSync(resolve(MIGRATIONS, file), 'utf-8')).join('\n');

describe('generated migrations (drizzle/)', () => {
  it('exist and are listed in the journal', () => {
    const journal = JSON.parse(
      readFileSync(resolve(MIGRATIONS, 'meta/_journal.json'), 'utf-8'),
    ) as {
      entries: { tag: string }[];
    };
    expect(sqlFiles.length).toBeGreaterThan(0);
    expect(journal.entries.map((entry) => `${entry.tag}.sql`).sort()).toEqual([...sqlFiles].sort());
  });

  it('keep tables in the default public schema and never create schemas', () => {
    expect(allSql).not.toContain('CREATE SCHEMA');

    const createdTables = [...allSql.matchAll(/CREATE TABLE "([^"]+)"(.)?/g)];
    expect(createdTables.length).toBeGreaterThan(0);
    // `"name" (` = unqualified (public); `"schema"."name"` would be another schema.
    expect(createdTables.some((match) => match[2] === '.')).toBe(false);
  });

  it('let the application generate ids (no database UUID v4 defaults)', () => {
    expect(allSql).not.toContain('gen_random_uuid()');
  });
});
