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
});
