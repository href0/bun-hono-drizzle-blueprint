import { beforeEach, describe, expect, it } from 'bun:test';
import { asc } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { runWithRequestContext } from '../core/context/request-context';
import { InternalServerError } from '../core/errors';
import { withoutManagedColumns } from './base.repository';
import { createSqlRecorder, rowOf } from '../../test/helpers/sql-recorder';
import {
  anOrder,
  ORDER_ID,
  TestOrdersRepository,
  testOrders,
} from '../../test/helpers/repository-fixtures';

const COLUMNS =
  '"id", "code", "note", "secret", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"';
const DELETED_AT = Temporal.Instant.from('2026-10-06T00:00:00Z');

const asUser = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithRequestContext(
    { requestId: 'req-base', locale: 'en', clientIp: '127.0.0.1', actor: 'user:42' },
    fn,
  );

describe('BaseRepository', () => {
  const recorder = createSqlRecorder();
  const orders = new TestOrdersRepository(recorder.txHost);
  const sqls = (): string[] => recorder.statements.map((statement) => statement.sql);
  const auditParams = (): unknown[] =>
    recorder.statements.find((statement) =>
      statement.sql.startsWith('insert into "record_changes"'),
    )?.params ?? [];

  beforeEach(() => {
    recorder.reset();
  });

  describe('reads only live rows', () => {
    it('findById', async () => {
      recorder.respondWith([rowOf(testOrders, anOrder())]);

      expect(await orders.findById(ORDER_ID)).toEqual(anOrder());
      expect(recorder.statements).toEqual([
        {
          sql: `select ${COLUMNS} from "test_orders" where ("test_orders"."deleted_at" is null and "test_orders"."id" = $1) limit $2`,
          params: [ORDER_ID, 1],
        },
      ]);
    });

    it('findById returns null when nothing matches', async () => {
      expect(await orders.findById(ORDER_ID)).toBeNull();
    });

    it('findPage orders by created_at DESC, id DESC and pages with limit/offset', async () => {
      await orders.findPage({ page: 3, perPage: 10 });

      expect(recorder.statements).toEqual([
        {
          sql: `select ${COLUMNS} from "test_orders" where "test_orders"."deleted_at" is null order by "test_orders"."created_at" desc, "test_orders"."id" desc limit $1 offset $2`,
          params: [10, 20],
        },
      ]);
    });

    it('findPage accepts another order', async () => {
      await orders.findPage({ page: 2, perPage: 5, orderBy: [asc(testOrders.code)] });

      expect(sqls()[0]).toContain('order by "test_orders"."code" asc limit $1 offset $2');
    });

    it('count', async () => {
      recorder.respondWith([[4]]);

      expect(await orders.count()).toBe(4);
      expect(sqls()).toEqual([
        'select count(*) from "test_orders" where "test_orders"."deleted_at" is null',
      ]);
    });

    it('count returns 0 when the query yields no row', async () => {
      expect(await orders.count()).toBe(0);
    });
  });

  describe('create', () => {
    it('stamps created_by / updated_by with the actor and ignores managed columns from callers', async () => {
      recorder.respondWith([rowOf(testOrders, anOrder())]);

      await asUser(() =>
        orders.create({
          id: ORDER_ID,
          code: 'ORD-1',
          // Managed columns smuggled in by a caller (e.g. a DTO spread) are dropped:
          ...({ createdBy: 'user:attacker', deletedAt: DELETED_AT } as object),
        }),
      );

      const insert = recorder.statements.at(0);
      expect(insert?.sql).toStartWith('insert into "test_orders"');
      expect(insert?.params).toContain('user:42');
      expect(insert?.params).not.toContain('user:attacker');
      expect(insert?.sql).toContain('"deleted_at") values (');
      expect(insert?.params).toContain(ORDER_ID);
      // Inserts are not audited: the row itself is the record.
      expect(sqls().some((sql) => sql.includes('record_changes'))).toBe(false);
    });

    it('throws when INSERT … RETURNING yields no row', async () => {
      expect(orders.create({ code: 'ORD-1' })).rejects.toBeInstanceOf(InternalServerError);
    });
  });

  describe('updateById', () => {
    it('locks, writes only the changed columns with the database clock, and audits them', async () => {
      recorder.respondWith(
        [rowOf(testOrders, anOrder())],
        [rowOf(testOrders, anOrder({ note: 'hello' }))],
      );

      const updated = await asUser(() => orders.updateById(ORDER_ID, { note: 'hello' }));

      expect(updated?.note).toBe('hello');
      expect(sqls().map((sql) => sql.split(' ')[0])).toEqual([
        'BEGIN',
        'select',
        'update',
        'insert',
        'COMMIT',
      ]);
      expect(sqls()[1]).toEndWith('for update');
      expect(recorder.statements.at(2)).toEqual({
        sql: `update "test_orders" set "note" = $1, "updated_at" = now(), "updated_by" = $2 where "test_orders"."id" = $3 returning ${COLUMNS}`,
        params: ['hello', 'user:42', ORDER_ID],
      });
      expect(auditParams().slice(0, 5)).toEqual([
        'test_orders',
        ORDER_ID,
        'UPDATE',
        JSON.stringify({ note: { from: null, to: 'hello' } }),
        'user:42',
      ]);
    });

    it('ignores managed columns in the patch', async () => {
      recorder.respondWith([rowOf(testOrders, anOrder())]);

      await orders.updateById(ORDER_ID, {
        ...({ createdBy: 'user:attacker', deletedAt: DELETED_AT, id: 'other' } as object),
      });

      expect(sqls()).toEqual(['BEGIN', expect.stringContaining('for update') as string, 'COMMIT']);
    });

    it('writes nothing when nothing changes', async () => {
      recorder.respondWith([rowOf(testOrders, anOrder())]);

      expect(await orders.updateById(ORDER_ID, { code: 'ORD-1' })).toEqual(anOrder());
      expect(sqls()).toHaveLength(3);
    });

    it('records a redacted column as changed without its values', async () => {
      recorder.respondWith([rowOf(testOrders, anOrder())], [rowOf(testOrders, anOrder())]);

      await orders.updateById(ORDER_ID, { secret: 'new-secret' });

      expect(auditParams()[3]).toBe(
        JSON.stringify({ secret: { from: '[REDACTED]', to: '[REDACTED]' } }),
      );
      expect(JSON.stringify(recorder.statements)).not.toContain('top-secret');
    });

    it('returns null for a missing or soft-deleted row without writing', async () => {
      expect(await orders.updateById(ORDER_ID, { note: 'x' })).toBeNull();

      recorder.reset();
      recorder.respondWith([rowOf(testOrders, anOrder({ deletedAt: DELETED_AT }))]);
      expect(await orders.updateById(ORDER_ID, { note: 'x' })).toBeNull();
      expect(sqls()).toHaveLength(3);
    });

    it('throws when the locked row cannot be updated', async () => {
      recorder.respondWith([rowOf(testOrders, anOrder())]);

      expect(orders.updateById(ORDER_ID, { note: 'x' })).rejects.toBeInstanceOf(
        InternalServerError,
      );
    });
  });

  describe('softDeleteById / restoreById', () => {
    it('soft delete sets deleted_at = now() and audits SOFT_DELETE with the stored value', async () => {
      recorder.respondWith(
        [rowOf(testOrders, anOrder())],
        [rowOf(testOrders, anOrder({ deletedAt: DELETED_AT }))],
      );

      const deleted = await orders.softDeleteById(ORDER_ID);

      expect(deleted?.deletedAt).toEqual(DELETED_AT);
      expect(sqls()[2]).toStartWith(
        'update "test_orders" set "updated_at" = now(), "updated_by" = $1, "deleted_at" = now() where',
      );
      expect(auditParams().slice(2, 4)).toEqual([
        'SOFT_DELETE',
        JSON.stringify({ deleted_at: { from: null, to: '2026-10-06T00:00:00Z' } }),
      ]);
    });

    it('soft delete returns null for a missing or already deleted row', async () => {
      expect(await orders.softDeleteById(ORDER_ID)).toBeNull();

      recorder.reset();
      recorder.respondWith([rowOf(testOrders, anOrder({ deletedAt: DELETED_AT }))]);
      expect(await orders.softDeleteById(ORDER_ID)).toBeNull();
      expect(sqls()).toHaveLength(3);
    });

    it('restore locks only a deleted row, clears deleted_at and audits RESTORE', async () => {
      recorder.respondWith(
        [rowOf(testOrders, anOrder({ deletedAt: DELETED_AT }))],
        [rowOf(testOrders, anOrder())],
      );

      const restored = await orders.restoreById(ORDER_ID);

      expect(restored?.deletedAt).toBeNull();
      expect(sqls()[1]).toContain(
        'where ("test_orders"."id" = $1 and "test_orders"."deleted_at" is not null)',
      );
      expect(sqls()[2]).toContain('"deleted_at" = $2 where "test_orders"."id" = $3');
      expect(recorder.statements.at(2)?.params[1]).toBeNull();
      expect(auditParams().slice(2, 4)).toEqual([
        'RESTORE',
        JSON.stringify({ deleted_at: { from: '2026-10-06T00:00:00Z', to: null } }),
      ]);
    });

    it('restore returns null when the row is not deleted', async () => {
      expect(await orders.restoreById(ORDER_ID)).toBeNull();
      expect(sqls()).toHaveLength(3);
    });
  });
});

describe('withoutManagedColumns', () => {
  it('drops managed columns and undefined members', () => {
    expect(
      withoutManagedColumns({
        id: 'x',
        createdBy: 'y',
        deletedAt: null,
        code: 'A',
        note: undefined,
      }),
    ).toEqual({ code: 'A' });
  });
});
