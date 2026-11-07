import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import { SuperAdminsRepository } from './super-admins';

/** The SQL of the anti-lockout lookup (hermetic); its effect on PostgreSQL: test/integration/rbac.int.ts. */
describe('SuperAdminsRepository.lockOtherActiveHolders', () => {
  const recorder = createSqlRecorder();
  const repository = new SuperAdminsRepository(recorder.txHost);
  const sqls = (): string[] => recorder.statements.map(({ sql }) => sql);

  beforeEach(() => {
    recorder.reset();
  });

  it('locks the live super_admin assignments, then keeps the other users who are live and active', async () => {
    recorder.respondWith(
      [['role-root']],
      // The locked assignment rows (every column of user_roles), u1 is the one being removed.
      [
        [
          'a1',
          'u1',
          'role-root',
          '2026-11-07 00:00:00+00',
          '2026-11-07 00:00:00+00',
          's',
          's',
          null,
        ],
        [
          'a2',
          'u2',
          'role-root',
          '2026-11-07 00:00:00+00',
          '2026-11-07 00:00:00+00',
          's',
          's',
          null,
        ],
      ],
      [['u2']],
    );
    const others = await recorder.txHost.run(() => repository.lockOtherActiveHolders('u1'));

    expect(others).toEqual(['u2']);
    const [role, lock, active] = sqls().filter((sql) => sql.startsWith('select'));
    expect(role).toContain('"roles"."key" = ');
    expect(lock).toContain('for update');
    expect(lock).toContain('"user_roles"."deleted_at" is null');
    expect(active).toContain('"users"."is_active" = ');
    expect(active).toContain('"users"."deleted_at" is null');
  });

  it('no super_admin role, or nobody else holding it: nobody remains', async () => {
    expect(await recorder.txHost.run(() => repository.lockOtherActiveHolders('u1'))).toEqual([]);

    recorder.respondWith([['role-root']], []);
    expect(await recorder.txHost.run(() => repository.lockOtherActiveHolders('u1'))).toEqual([]);
  });
});
