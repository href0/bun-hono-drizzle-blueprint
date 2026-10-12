import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';
import { sampleUser } from '../../../test/helpers/auth-fakes';
import { users } from '../schema';
import { SeedAdminError, seedAdmin, type SeedAdminInput } from './seed-admin';

const fakeHash = (password: string): Promise<string> => Promise.resolve(`hashed:${password}`);

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

  it('creates an active admin stamped by the system actor, with a hashed password', async () => {
    const created = sampleUser({ email: input.email, role: 'admin', createdBy: 'system' });
    recorder.respondWith([], [rowOf(users, created)]);

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
        'admin',
        true,
        'system',
      ]),
    );
    expect(JSON.stringify(recorder.statements)).not.toContain('"long enough password"');
  });

  it('leaves an existing active admin untouched (idempotent)', async () => {
    const admin = sampleUser({ email: input.email, role: 'admin' });
    recorder.respondWith([rowOf(users, admin)]);

    expect(await run()).toEqual({ action: 'unchanged', user: admin });
    expect(sqlOf().some((sql) => sql.startsWith('insert') || sql.startsWith('update'))).toBe(false);
  });

  it('refuses to touch an existing non-admin without --promote', async () => {
    recorder.respondWith([rowOf(users, sampleUser({ email: input.email, isActive: false }))]);

    expect(run()).rejects.toThrow('already exists (role user, inactive). Run again with --promote');
  });

  it('--promote turns an existing user into an active admin through the audited update', async () => {
    const user = sampleUser({ email: input.email, isActive: false });
    const promoted = { ...user, role: 'admin', isActive: true };
    recorder.respondWith([rowOf(users, user)], [rowOf(users, user)], [rowOf(users, promoted)]);

    const result = await run({ promote: true, password: undefined });

    expect(result.action).toBe('promoted');
    expect(result.user).toMatchObject({ role: 'admin', isActive: true });
    expect(sqlOf()).toContain('insert into "record_changes"');
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
    recorder.respondWith([], [rowOf(users, sampleUser({ role: 'admin' }))]);

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
    expect(await Bun.password.verify('real password', String(hash))).toBe(true);
  });
});
