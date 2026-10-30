import { describe, expect, it } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Temporal } from 'temporal-polyfill';
import { testOrders } from '../../test/helpers/repository-fixtures';
import { InternalServerError } from '../core/errors';
import { escapeLike, instantRange, listPage, orderFromSort, searchCondition } from './list-query';

const dialect = new PgDialect();
const render = (sql: SQL | undefined) => (sql === undefined ? undefined : dialect.sqlToQuery(sql));
const columns = { code: testOrders.code, createdAt: testOrders.createdAt };

describe('list query SQL (D41)', () => {
  it('escapeLike makes %, _ and \\ match themselves', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escapeLike('plain')).toBe('plain');
  });

  it('orderFromSort follows the keys and ends with id in the last key direction', () => {
    const order = orderFromSort(
      [
        { field: 'createdAt', direction: 'desc' },
        { field: 'code', direction: 'asc' },
      ],
      columns,
      testOrders.id,
    );
    expect(order?.map((part) => render(part)?.sql)).toEqual([
      '"test_orders"."created_at" desc',
      '"test_orders"."code" asc',
      '"test_orders"."id" asc',
    ]);
  });

  it('orderFromSort without keys leaves the repository default', () => {
    expect(orderFromSort(undefined, columns, testOrders.id)).toBeUndefined();
    expect(orderFromSort([], columns, testOrders.id)).toBeUndefined();
  });

  it('searchCondition needs both q and columns', () => {
    expect(searchCondition(undefined, [testOrders.code])).toBeUndefined();
    expect(searchCondition('x', [])).toBeUndefined();
    expect(searchCondition('x')).toBeUndefined();
    expect(render(searchCondition('a_b', [testOrders.code]))).toMatchObject({
      sql: '"test_orders"."code" ilike $1',
      params: ['%a\\_b%'],
    });
  });

  it('listPage refuses q when the repository names no search column, before any query', async () => {
    let queried = false;
    const run = (search?: readonly (typeof testOrders.code)[]) =>
      listPage({
        query: { page: 1, perPage: 10, q: 'ada' },
        columns: { sort: columns, ...(search === undefined ? {} : { search }) },
        id: testOrders.id,
        page: async () => {
          queried = true;
          return [];
        },
        count: async () => 0,
      });

    for (const search of [undefined, []]) {
      queried = false;
      expect(run(search)).rejects.toBeInstanceOf(InternalServerError);
      await run(search).catch(() => undefined);
      expect(queried).toBe(false);
    }
    expect(await run([testOrders.code])).toEqual({ rows: [], total: 0 });
  });

  it('instantRange is inclusive and each bound is optional', () => {
    const from = Temporal.Instant.from('2026-10-01T00:00:00Z');
    const to = Temporal.Instant.from('2026-10-31T00:00:00Z');
    expect(render(instantRange(testOrders.createdAt, from, to))?.sql).toBe(
      '("test_orders"."created_at" >= $1 and "test_orders"."created_at" <= $2)',
    );
    expect(render(instantRange(testOrders.createdAt, from, undefined))?.sql).toBe(
      '"test_orders"."created_at" >= $1',
    );
    expect(render(instantRange(testOrders.createdAt, undefined, to))?.sql).toBe(
      '"test_orders"."created_at" <= $1',
    );
    expect(instantRange(testOrders.createdAt, undefined, undefined)).toBeUndefined();
  });
});
