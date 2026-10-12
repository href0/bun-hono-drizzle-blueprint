import { describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { users, type User } from '../../src/database/schema';
import { NOW } from '../../src/database/schema/columns';
import { createSqlRecorder, rowOf } from './sql-recorder';

const sampleUser: User = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  email: 'recorder@example.com',
  fullName: 'Recorder',
  passwordHash: 'hash',
  role: 'user',
  passwordChangedAt: null,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00.123456Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T04:00:00Z'),
};

describe('createSqlRecorder', () => {
  it('records the SQL and parameters that Drizzle sends', async () => {
    const recorder = createSqlRecorder();

    await recorder.db.select().from(users).where(eq(users.email, 'a@b.c')).limit(1);

    expect(recorder.statements).toEqual([
      {
        sql: 'select "id", "email", "full_name", "password_hash", "password_changed_at", "role", "is_active", "created_at", "updated_at", "created_by", "updated_by", "deleted_at" from "users" where "users"."email" = $1 limit $2',
        params: ['a@b.c', 1],
      },
    ]);
  });

  it('returns queued result sets in order, mapped through the column types', async () => {
    const recorder = createSqlRecorder();
    recorder.respondWith([rowOf(users, sampleUser)], [[7]]);

    const found = (await recorder.db.select().from(users)).at(0);
    const [counted] = await recorder.db.select({ total: sql<number>`count(*)` }).from(users);

    expect(found).toEqual(sampleUser);
    expect(found?.createdAt).toBeInstanceOf(Temporal.Instant);
    expect(counted).toEqual({ total: 7 });
  });

  it('returns no rows for a query with nothing queued', async () => {
    const recorder = createSqlRecorder();

    expect(await recorder.db.select().from(users)).toEqual([]);
  });

  it('records BEGIN and COMMIT around a successful transaction', async () => {
    const recorder = createSqlRecorder();

    await recorder.txHost.run(async () => {
      await recorder.txHost.tx.select().from(users);
    });

    expect(recorder.statements.map((statement) => statement.sql.split(' ')[0])).toEqual([
      'BEGIN',
      'select',
      'COMMIT',
    ]);
  });

  it('records ROLLBACK and rethrows when the transaction fails', async () => {
    const recorder = createSqlRecorder();
    const failure = new Error('boom');

    const run = recorder.txHost.run(async () => {
      await recorder.txHost.tx
        .update(users)
        .set({ fullName: 'X' })
        .where(eq(users.id, sampleUser.id));
      throw failure;
    });

    expect(run).rejects.toBe(failure);
    await run.catch(() => undefined);
    expect(recorder.statements.at(0)?.sql).toBe('BEGIN');
    expect(recorder.statements.at(1)?.sql).toStartWith('update "users" set "full_name" = $1');
    expect(recorder.statements.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('records savepoints for nested Drizzle transactions', async () => {
    const recorder = createSqlRecorder();

    await recorder.db.transaction(async (tx) => {
      await tx.transaction(async (inner) => {
        await inner.select().from(users);
      });
      await tx
        .transaction(async (inner) => {
          inner.rollback();
          return Promise.resolve();
        })
        .catch(() => undefined);
    });

    expect(recorder.statements.map((statement) => statement.sql.split(' "')[0])).toEqual([
      'BEGIN',
      'SAVEPOINT',
      'select',
      'RELEASE',
      'SAVEPOINT',
      'ROLLBACK TO SAVEPOINT',
      'COMMIT',
    ]);
  });

  it('reset clears statements and queued results', async () => {
    const recorder = createSqlRecorder();
    recorder.respondWith([rowOf(users, sampleUser)]);
    await recorder.db.select().from(users);
    recorder.respondWith([rowOf(users, sampleUser)]);

    recorder.reset();

    expect(recorder.statements).toEqual([]);
    expect(await recorder.db.select().from(users)).toEqual([]);
  });
});

describe('rowOf', () => {
  it('orders values like the table columns and maps them to their driver form', () => {
    expect(rowOf(users, sampleUser)).toEqual([
      sampleUser.id,
      sampleUser.email,
      sampleUser.fullName,
      sampleUser.passwordHash,
      null,
      sampleUser.role,
      true,
      '2026-10-05T03:00:00.123456Z',
      '2026-10-05T04:00:00Z',
      'system',
      'system',
      null,
    ]);
  });
});

describe('database clock in updates (drizzle-orm behaviour this project relies on)', () => {
  it('sends an explicit NOW in set() as now(), while $onUpdate values are bound as parameters', async () => {
    const recorder = createSqlRecorder();

    await recorder.db.update(users).set({ fullName: 'B' }).where(eq(users.id, 'x'));
    await recorder.db.update(users).set({ fullName: 'B', updatedAt: NOW }).where(eq(users.id, 'x'));

    // Fallback ($onUpdate): application clock, as a parameter.
    expect(recorder.statements.at(0)?.sql).toContain('"updated_at" = $2');
    expect(recorder.statements.at(0)?.params[1]).toMatch(/Z$/);
    // Explicit NOW (what BaseRepository does): database clock.
    expect(recorder.statements.at(1)?.sql).toContain('"updated_at" = now()');
  });
});
