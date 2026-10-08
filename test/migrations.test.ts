import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RECORD_CHANGE_ACTIONS } from '../src/database/schema';

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

  it('constrain record_changes.action to exactly RECORD_CHANGE_ACTIONS (literal list in the CHECK)', () => {
    const check = /"record_changes_action_check" CHECK \("action" in \(([^)]*)\)\)/.exec(allSql);
    const listed = check?.[1]?.split(',').map((value) => value.trim().replaceAll("'", ''));
    expect(listed).toEqual([...RECORD_CHANGE_ACTIONS]);
  });

  it('keep record_changes partition-ready: primary key (id, changed_at), no foreign keys', () => {
    const table = /CREATE TABLE "record_changes" \(([\s\S]*?)\n\);/.exec(allSql)?.[1] ?? '';
    expect(table).toContain('PRIMARY KEY("id","changed_at")');
    expect(table).not.toContain('REFERENCES');
    expect(table).not.toContain('UNIQUE');
    // Later migrations must not add them either.
    expect(allSql).not.toMatch(/ALTER TABLE "record_changes"[^;]*(FOREIGN KEY|UNIQUE)/);
  });

  it('pair record_changes.parent_table with parent_id (both set or both null)', () => {
    expect(allSql).toContain(
      '"record_changes_parent_check" CHECK (("parent_table" is null) = ("parent_id" is null))',
    );
  });
});
