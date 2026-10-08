import { beforeEach, describe, expect, it } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { InternalServerError } from '../core/errors';
import { createSqlRecorder, rowOf } from '../../test/helpers/sql-recorder';
import { TestEventsRepository, testEvents } from '../../test/helpers/repository-fixtures';

const EVENT = {
  id: 7,
  kind: 'login',
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
};

describe('AppendOnlyRepository', () => {
  const recorder = createSqlRecorder();
  const events = new TestEventsRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('append inserts and returns the row (id and timestamps from the database)', async () => {
    recorder.respondWith([rowOf(testEvents, EVENT)]);

    expect(await events.append({ kind: 'login' })).toEqual(EVENT);
    expect(recorder.statements.at(0)).toEqual({
      sql: 'insert into "test_events" ("id", "kind", "created_at", "updated_at") values (default, $1, default, default) returning "id", "kind", "created_at", "updated_at"',
      params: ['login'],
    });
  });

  it('append throws when INSERT … RETURNING yields no row', async () => {
    expect(events.append({ kind: 'login' })).rejects.toBeInstanceOf(InternalServerError);
  });

  it('findPage lists newest first by default, with an optional filter', async () => {
    await events.findPage({ page: 2, perPage: 10, where: eq(testEvents.kind, 'login') });

    expect(recorder.statements.at(0)).toEqual({
      sql: 'select "id", "kind", "created_at", "updated_at" from "test_events" where "test_events"."kind" = $1 order by "test_events"."id" desc limit $2 offset $3',
      params: ['login', 10, 10],
    });
  });

  it('findPage accepts another order', async () => {
    await events.findPage({ page: 1, perPage: 5, orderBy: [asc(testEvents.createdAt)] });

    expect(recorder.statements.at(0)?.sql).toContain('order by "test_events"."created_at" asc');
  });

  it('count, with and without a filter', async () => {
    recorder.respondWith([[3]]);

    expect(await events.count(eq(testEvents.kind, 'login'))).toBe(3);
    expect(await events.count()).toBe(0);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      'select count(*) from "test_events" where "test_events"."kind" = $1',
      'select count(*) from "test_events"',
    ]);
  });

  it('offers no way to change or remove a record', () => {
    const methods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(Object.getPrototypeOf(events)),
    );
    expect(methods.sort()).toEqual(['append', 'constructor', 'count', 'findPage']);
  });
});
