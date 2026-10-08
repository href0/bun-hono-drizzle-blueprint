import { beforeEach, describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { UsersRepository } from './users.repository';
import { users, type User } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';

const SELECT_USER =
  'select "id", "email", "full_name", "password_hash", "is_active", "created_at", "updated_at" from "users"';

describe('UsersRepository (Unit)', () => {
  const sampleUser: User = {
    id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    email: 'repo@example.com',
    fullName: 'Repo User',
    passwordHash: 'hash',
    isActive: true,
    createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  };

  const recorder = createSqlRecorder();
  const repo = new UsersRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('findById filters by id', async () => {
    recorder.respondWith([rowOf(users, sampleUser)]);

    expect(await repo.findById(sampleUser.id)).toEqual(sampleUser);
    expect(recorder.statements).toEqual([
      { sql: `${SELECT_USER} where "users"."id" = $1`, params: [sampleUser.id] },
    ]);
  });

  it('findById returns null when no row matches', async () => {
    expect(await repo.findById(sampleUser.id)).toBeNull();
  });

  it('findByEmail filters by email', async () => {
    recorder.respondWith([rowOf(users, sampleUser)]);

    expect(await repo.findByEmail(sampleUser.email)).toEqual(sampleUser);
    expect(recorder.statements).toEqual([
      { sql: `${SELECT_USER} where "users"."email" = $1`, params: [sampleUser.email] },
    ]);
  });

  it('create inserts the row and returns it', async () => {
    recorder.respondWith([rowOf(users, sampleUser)]);

    const created = await repo.create({
      id: sampleUser.id,
      email: sampleUser.email,
      fullName: sampleUser.fullName,
      passwordHash: sampleUser.passwordHash,
      isActive: true,
    });

    expect(created).toEqual(sampleUser);
    expect(recorder.statements.at(0)?.sql).toStartWith('insert into "users"');
    expect(recorder.statements.at(0)?.sql).toEndWith(
      'returning "id", "email", "full_name", "password_hash", "is_active", "created_at", "updated_at"',
    );
    expect(recorder.statements.at(0)?.params.slice(0, 5)).toEqual([
      sampleUser.id,
      sampleUser.email,
      sampleUser.fullName,
      sampleUser.passwordHash,
      true,
    ]);
  });

  it('create throws when INSERT … RETURNING yields no row', async () => {
    expect(
      repo.create({ email: sampleUser.email, fullName: sampleUser.fullName, passwordHash: 'hash' }),
    ).rejects.toThrow('INSERT INTO users returned no rows');
  });

  it('findAll pages with limit and offset', async () => {
    recorder.respondWith([rowOf(users, sampleUser)]);

    expect(await repo.findAll(10, 20)).toEqual([sampleUser]);
    expect(recorder.statements).toEqual([
      { sql: `${SELECT_USER} limit $1 offset $2`, params: [10, 20] },
    ]);
  });

  it('count returns the integer count', async () => {
    recorder.respondWith([[5]]);

    expect(await repo.count()).toBe(5);
    expect(recorder.statements).toEqual([
      { sql: 'select cast(count(*) as integer) from "users"', params: [] },
    ]);
  });

  it('count returns 0 when the query yields no row', async () => {
    expect(await repo.count()).toBe(0);
  });
});
