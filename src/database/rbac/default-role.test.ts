import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';
import { InternalServerError } from '../../core/errors';
import { parseInstant } from '../../utils/datetime.util';
import { userRoles, type UserRole } from '../schema';
import { DefaultRoleRepository } from './default-role';

const USER_ROLE_ID = '0192f1d0-0000-7000-8000-0000000000bb';
const USER_ID = '0192f1d0-0000-7000-8000-0000000000cc';

describe('DefaultRoleRepository (SQL shape; PostgreSQL: test/integration/rbac.int.ts)', () => {
  const recorder = createSqlRecorder();
  beforeEach(() => {
    recorder.reset();
  });

  it('gives the user the live system role user, stamped by the actor', async () => {
    const at = parseInstant('2026-11-07T00:00:00Z');
    const row: UserRole = {
      id: '0192f1d0-0000-7000-8000-0000000000dd',
      userId: USER_ID,
      roleId: USER_ROLE_ID,
      createdAt: at,
      updatedAt: at,
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    };
    recorder.respondWith([[USER_ROLE_ID]], [rowOf(userRoles, row)]);

    await new DefaultRoleRepository(recorder.txHost).assign(USER_ID);

    const [lookup, insert] = recorder.statements;
    expect(lookup.sql).toContain('"roles"."key" = $1');
    expect(lookup.sql).toContain('"roles"."deleted_at" is null');
    expect(lookup.params).toContain('user');
    expect(insert.sql).toStartWith('insert into "user_roles"');
    expect(insert.params).toEqual(expect.arrayContaining([USER_ID, USER_ROLE_ID, 'system']));
  });

  it('refuses when the system role is missing (migrations not applied)', async () => {
    recorder.respondWith([]);
    const error = await new DefaultRoleRepository(recorder.txHost)
      .assign(USER_ID)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InternalServerError);
  });
});
