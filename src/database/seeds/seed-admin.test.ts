import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';
import { sampleUser } from '../../../test/helpers/auth-fakes';
import { verifyPassword } from '../../core/security/password';
import { parseInstant } from '../../utils/datetime.util';
import { userRoles, users, type UserRole } from '../schema';
import { SeedAdminError, seedAdmin, type SeedAdminInput } from './seed-admin';

const fakeHash = (password: string): Promise<string> => Promise.resolve(`hashed:${password}`);

const SUPER_ADMIN_ID = '0192f1d0-0000-7000-8000-0000000000aa';
/** The `super_admin` lookup, then "does the user hold it?" (no), then the inserted assignment. */
const assignSuperAdmin = (userId: string): unknown[][][] => {
  const at = parseInstant('2026-11-07T00:00:00Z');
  const row: UserRole = {
    id: '0192f1d0-0000-7000-8000-0000000000ab',
    userId,
    roleId: SUPER_ADMIN_ID,
    createdAt: at,
    updatedAt: at,
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
  };
  return [[[SUPER_ADMIN_ID]], [], [rowOf(userRoles, row)]];
};
/** The `super_admin` lookup, then "does the user hold it?" (yes). */
const holdsSuperAdmin = (): unknown[][][] => [
  [[SUPER_ADMIN_ID]],
  [['0192f1d0-0000-7000-8000-0000000000ab']],
];

/** The `super_admin` lookup, then "does the user hold it?" (no). */
const lacksSuperAdmin = (): unknown[][][] => [[[SUPER_ADMIN_ID]], []];

describe('seedAdmin', () => {
  const recorder = createSqlRecorder();
  const input: SeedAdminInput = {
    email: 'admin@example.com',
    fullName: 'Administrator',
    password: 'long enough password',
    promote: false,
  };
  const run = (overrides: Partial<SeedAdminInput> = {}) =>
    seedAdmin({ ...input, ...overrides }, recorder.txHost, fakeHash);
  const sqlOf = (): string[] =>
    recorder.statements.map((statement) => statement.sql.split(' (')[0] ?? '');

  beforeEach(() => {
    recorder.reset();
  });

  it('creates an active super admin stamped by the system actor, with a hashed password', async () => {
    const created = sampleUser({ email: input.email, createdBy: 'system' });
    recorder.respondWith([], [rowOf(users, created)], ...assignSuperAdmin(created.id));

    const result = await run();

    expect(result).toEqual({ action: 'created', user: created });
    const insert = recorder.statements.find((statement) =>
      statement.sql.startsWith('insert into "users"'),
    );
    expect(insert?.params).toEqual(
      expect.arrayContaining([
        input.email,
        'Administrator',
        'hashed:long enough password',
        true,
        'system',
      ]),
    );
    expect(JSON.stringify(recorder.statements)).not.toContain('"long enough password"');
    const assignment = recorder.statements.find((statement) =>
      statement.sql.startsWith('insert into "user_roles"'),
    );
    expect(assignment?.params).toEqual(
      expect.arrayContaining([created.id, SUPER_ADMIN_ID, 'system']),
    );
  });

  it('leaves an existing active super admin untouched (idempotent)', async () => {
    const admin = sampleUser({ email: input.email });
    recorder.respondWith([rowOf(users, admin)], ...holdsSuperAdmin());

    expect(await run()).toEqual({ action: 'unchanged', user: admin });
    expect(sqlOf().some((sql) => sql.startsWith('insert') || sql.startsWith('update'))).toBe(false);
  });

  it('refuses to touch an existing user who is not an active super admin without --promote', async () => {
    recorder.respondWith([rowOf(users, sampleUser({ email: input.email }))], ...lacksSuperAdmin());
    expect(run()).rejects.toThrow('already exists (not a super admin). Run again with --promote');

    recorder.respondWith(
      [rowOf(users, sampleUser({ email: input.email, isActive: false }))],
      ...holdsSuperAdmin(),
    );
    expect(run()).rejects.toThrow('already exists (a super admin, inactive)');
  });

  it('--promote activates through the audited update and gives the super_admin role', async () => {
    const user = sampleUser({ email: input.email, isActive: false });
    const promoted = { ...user, isActive: true };
    recorder.respondWith(
      [rowOf(users, user)],
      ...lacksSuperAdmin(),
      [rowOf(users, user)],
      [rowOf(users, promoted)],
      [],
      ...assignSuperAdmin(user.id),
    );

    const result = await run({ promote: true, password: undefined });

    expect(result).toEqual({ action: 'promoted', user: promoted });
    expect(sqlOf()).toContain('insert into "record_changes"');
    expect(sqlOf()).toContain('insert into "user_roles"');
  });

  it('--promote of an active user only gives the role (no update)', async () => {
    const user = sampleUser({ email: input.email });
    recorder.respondWith([rowOf(users, user)], ...lacksSuperAdmin(), ...assignSuperAdmin(user.id));

    expect(await run({ promote: true, password: undefined })).toEqual({ action: 'promoted', user });
    expect(sqlOf().some((sql) => sql.startsWith('update'))).toBe(false);
  });

  it('refuses when the super_admin role is missing (migrations not applied)', async () => {
    recorder.respondWith([], [rowOf(users, sampleUser({ email: input.email }))], []);

    expect(run()).rejects.toThrow('The super_admin role is missing');
  });

  it('--promote of an unknown email, a short password and an invalid email are refused', async () => {
    recorder.respondWith([]);
    expect(run({ promote: true })).rejects.toThrow('does not exist; run without --promote');

    recorder.respondWith([]);
    expect(run({ password: 'short' })).rejects.toThrow('at least 8 characters');

    recorder.respondWith([]);
    expect(run({ password: undefined })).rejects.toThrow('at least 8 characters');

    const invalid = await run({ email: 'not-an-email' }).catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(SeedAdminError);
  });
});

describe('seedAdmin with the default hasher', () => {
  it('stores an argon2 hash that verifies against the given password', async () => {
    const recorder = createSqlRecorder();
    const created = sampleUser();
    recorder.respondWith([], [rowOf(users, created)], ...assignSuperAdmin(created.id));

    await seedAdmin(
      {
        email: 'admin@example.com',
        fullName: 'Administrator',
        password: 'real password',
        promote: false,
      },
      recorder.txHost,
    );

    const insert = recorder.statements.find((statement) =>
      statement.sql.startsWith('insert into "users"'),
    );
    const hash = insert?.params.find(
      (param) => typeof param === 'string' && param.startsWith('$argon2'),
    );
    expect(await verifyPassword('real password', String(hash))).toBe(true);
  });
});

describe('seedAdmin cache eviction', () => {
  it('calls onUserChanged after a promotion, never after a creation or a no-op', async () => {
    const changed: string[] = [];
    const onUserChanged = (id: string): Promise<void> => {
      changed.push(id);
      return Promise.resolve();
    };
    const recorder = createSqlRecorder();
    const user = sampleUser({ email: 'admin@example.com' });
    const input: SeedAdminInput = {
      email: user.email,
      fullName: 'A',
      password: 'long enough',
      promote: true,
    };
    const hash = (password: string) => Promise.resolve(password);

    recorder.respondWith([rowOf(users, user)], ...lacksSuperAdmin(), ...assignSuperAdmin(user.id));
    await seedAdmin(input, recorder.txHost, hash, onUserChanged);
    recorder.respondWith([rowOf(users, user)], ...holdsSuperAdmin());
    await seedAdmin(input, recorder.txHost, hash, onUserChanged);
    const other = sampleUser({ id: '0192f1d0-0000-7000-8000-0000000000cc' });
    recorder.respondWith([], [rowOf(users, other)], ...assignSuperAdmin(other.id));
    await seedAdmin(
      { ...input, email: 'new@example.com', promote: false },
      recorder.txHost,
      hash,
      onUserChanged,
    );

    expect(changed).toEqual([user.id]);
  });
});
