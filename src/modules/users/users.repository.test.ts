import { beforeEach, describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { UsersRepository } from './users.repository';
import { users, type User } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';

const COLUMNS =
  '"id", "email", "full_name", "password_hash", "password_changed_at", "role", "is_active", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"';

/** Generic behaviour (paging, audited update, soft delete, restore) is tested in base.repository.test.ts. */
describe('UsersRepository (Unit)', () => {
  const sampleUser: User = {
    id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    email: 'repo@example.com',
    fullName: 'Repo User',
    passwordHash: 'hash',
    role: 'user',
    passwordChangedAt: null,
    isActive: true,
    createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
  };

  const recorder = createSqlRecorder();
  const repo = new UsersRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('findByEmail looks up live users only', async () => {
    recorder.respondWith([rowOf(users, sampleUser)]);

    expect(await repo.findByEmail(sampleUser.email)).toEqual(sampleUser);
    expect(recorder.statements).toEqual([
      {
        sql: `select ${COLUMNS} from "users" where ("users"."deleted_at" is null and "users"."email" = $1) limit $2`,
        params: [sampleUser.email, 1],
      },
    ]);
  });

  it('findByEmail returns null when no live user has the email', async () => {
    expect(await repo.findByEmail(sampleUser.email)).toBeNull();
  });

  it('redacts the password hash in record_changes', async () => {
    recorder.respondWith([rowOf(users, sampleUser)], [rowOf(users, sampleUser)]);

    await repo.updateById(sampleUser.id, { passwordHash: 'new-hash' });

    const audit = recorder.statements.find((statement) =>
      statement.sql.startsWith('insert into "record_changes"'),
    );
    expect(audit?.params[3]).toBe(
      JSON.stringify({ password_hash: { from: '[REDACTED]', to: '[REDACTED]' } }),
    );
    expect(JSON.stringify(audit)).not.toContain('new-hash');
  });

  it('lists by the allowlist with every typed filter on the page and the total (D41)', async () => {
    recorder.respondWith([rowOf(users, sampleUser)], [[1]]);

    const result = await repo.findUserList({
      page: 1,
      perPage: 10,
      sort: [{ field: 'fullName', direction: 'asc' }],
      q: 'ada',
      role: 'admin',
      isActive: true,
      createdFrom: Temporal.Instant.from('2026-10-01T00:00:00Z'),
      createdTo: Temporal.Instant.from('2026-10-31T00:00:00Z'),
    });

    expect(result).toEqual({ rows: [sampleUser], total: 1 });
    const where =
      'where ("users"."deleted_at" is null and (("users"."email" ilike $1 or "users"."full_name" ilike $2) and ("users"."role" = $3 and "users"."is_active" = $4 and ("users"."created_at" >= $5 and "users"."created_at" <= $6))))';
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      `select ${COLUMNS} from "users" ${where} order by "users"."full_name" asc, "users"."id" asc limit $7`,
      `select count(*) from "users" ${where}`,
    ]);
    expect(recorder.statements.at(1)?.params.slice(0, 4)).toEqual([
      '%ada%',
      '%ada%',
      'admin',
      true,
    ]);
  });

  it('lists without filters: only the live-row scope', async () => {
    recorder.respondWith([], [[0]]);

    expect(await repo.findUserList({ page: 1, perPage: 10 })).toEqual({ rows: [], total: 0 });
    expect(recorder.statements.at(1)?.sql).toBe(
      'select count(*) from "users" where "users"."deleted_at" is null',
    );
  });
});
