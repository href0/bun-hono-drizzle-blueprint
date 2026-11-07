import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import { UsersRolesRepository } from './users-roles.repository';

describe('UsersRolesRepository (SQL shape; PostgreSQL: test/integration/rbac.int.ts)', () => {
  const recorder = createSqlRecorder();
  beforeEach(() => {
    recorder.reset();
  });

  it('reads the live role keys of every user in one query, grouped per user', async () => {
    recorder.respondWith([
      ['u1', 'super_admin'],
      ['u1', 'user'],
      ['u2', 'user'],
    ]);

    const keys = await new UsersRolesRepository(recorder.txHost).findRoleKeys(['u1', 'u2', 'u3']);

    expect(keys).toEqual(
      new Map([
        ['u1', ['super_admin', 'user']],
        ['u2', ['user']],
      ]),
    );
    expect(recorder.statements).toHaveLength(1);
    const [query] = recorder.statements;
    expect(query.sql).toContain('"user_roles"."deleted_at" is null');
    expect(query.sql).toContain('"roles"."deleted_at" is null');
    expect(query.sql).toContain('order by "roles"."key" asc');
  });

  it('asks nothing for no users', async () => {
    expect(await new UsersRolesRepository(recorder.txHost).findRoleKeys([])).toEqual(new Map());
    expect(recorder.statements).toEqual([]);
  });
});
