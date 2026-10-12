import { beforeEach, describe, expect, it } from 'bun:test';
import { users } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';
import { sampleUser } from '../../../test/helpers/auth-fakes';
import { AuthUsersRepository } from './auth-users.repository';

/** Generic behaviour (create stamps, findById scope, audit) is tested in base.repository.test.ts. */
describe('AuthUsersRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repo = new AuthUsersRepository(recorder.txHost);
  const user = sampleUser();

  beforeEach(() => {
    recorder.reset();
  });

  it('findByEmail looks up live users only (inactive ones included: login rejects them)', async () => {
    recorder.respondWith([rowOf(users, user)]);

    expect(await repo.findByEmail(user.email)).toEqual(user);
    expect(recorder.statements.at(0)?.sql).toEndWith(
      'from "users" where ("users"."deleted_at" is null and "users"."email" = $1) limit $2',
    );
    expect(await repo.findByEmail('nobody@example.com')).toBeNull();
  });

  it('redacts the password hash in record_changes', async () => {
    recorder.respondWith([rowOf(users, user)], [rowOf(users, user)]);

    await repo.updateById(user.id, { passwordHash: 'new-hash' });

    const audit = recorder.statements.find((statement) =>
      statement.sql.startsWith('insert into "record_changes"'),
    );
    expect(JSON.stringify(audit)).not.toContain('new-hash');
  });
});
