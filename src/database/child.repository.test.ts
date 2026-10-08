import { beforeEach, describe, expect, it } from 'bun:test';
import { BadRequestError, InternalServerError, NotFoundError } from '../core/errors';
import { ChildRepository } from './child.repository';
import { createSqlRecorder, rowOf } from '../../test/helpers/sql-recorder';
import {
  aLine,
  ORDER_ID,
  OTHER_ORDER_ID,
  TestOrderLinesRepository,
  testOrderLines,
  testOrders,
} from '../../test/helpers/repository-fixtures';

const LINE_A = '0192f1d0-0000-7000-8000-00000000000a';
const LINE_B = '0192f1d0-0000-7000-8000-00000000000b';

const LIVE_PARENT =
  'select "id" from "test_orders" where ("test_orders"."id" = $1 and "test_orders"."deleted_at" is null)';
const TOUCH_PARENT =
  'update "test_orders" set "updated_at" = now(), "updated_by" = $1 where "test_orders"."id" = $2';

const parentRow = [[ORDER_ID]];

describe('ChildRepository', () => {
  const recorder = createSqlRecorder();
  const lines = new TestOrderLinesRepository(recorder.txHost);
  const sqls = (): string[] => recorder.statements.map((statement) => statement.sql);
  const audits = (): unknown[][] =>
    recorder.statements
      .filter((statement) => statement.sql.startsWith('insert into "record_changes"'))
      .map((statement) => statement.params);

  beforeEach(() => {
    recorder.reset();
  });

  describe('reads through the live header', () => {
    it('findAllForParent checks the header, then lists its details oldest first', async () => {
      recorder.respondWith(parentRow, [rowOf(testOrderLines, aLine(LINE_A))]);

      expect(await lines.findAllForParent(ORDER_ID)).toEqual([aLine(LINE_A)]);
      expect(recorder.statements.at(0)).toEqual({ sql: LIVE_PARENT, params: [ORDER_ID] });
      expect(sqls()[1]).toEndWith(
        'where "test_order_lines"."order_id" = $1 order by "test_order_lines"."created_at" asc, "test_order_lines"."id" asc',
      );
    });

    it('findByIdForParent filters by header and id (no IDOR)', async () => {
      recorder.respondWith(parentRow);

      expect(await lines.findByIdForParent(ORDER_ID, LINE_A)).toBeNull();
      expect(sqls()[1]).toContain(
        'where ("test_order_lines"."order_id" = $1 and "test_order_lines"."id" = $2)',
      );
      expect(recorder.statements.at(1)?.params).toEqual([ORDER_ID, LINE_A]);
    });

    it('a missing or soft-deleted header is NotFoundError, before any detail query', async () => {
      expect(lines.findAllForParent(ORDER_ID)).rejects.toBeInstanceOf(NotFoundError);
      await lines.findAllForParent(ORDER_ID).catch(() => undefined);
      expect(sqls().every((sql) => sql === LIVE_PARENT)).toBe(true);
    });
  });

  describe('createForParent', () => {
    it('locks the header, inserts under it with the actor, and touches the header', async () => {
      recorder.respondWith(parentRow, [rowOf(testOrderLines, aLine(LINE_A))]);

      await lines.createForParent(ORDER_ID, {
        item: 'item-a',
        qty: 1,
        // Re-parenting through the input is ignored:
        orderId: OTHER_ORDER_ID,
      });

      expect(sqls()).toEqual([
        'BEGIN',
        `${LIVE_PARENT} for update`,
        expect.stringMatching(/^insert into "test_order_lines"/) as string,
        TOUCH_PARENT,
        'COMMIT',
      ]);
      expect(recorder.statements.at(2)?.params).toContain(ORDER_ID);
      expect(recorder.statements.at(2)?.params).not.toContain(OTHER_ORDER_ID);
    });

    it('rolls back with NotFoundError when the header is missing or soft-deleted', async () => {
      const create = lines.createForParent(ORDER_ID, { item: 'x', qty: 1 });

      expect(create).rejects.toBeInstanceOf(NotFoundError);
      await create.catch(() => undefined);
      expect(sqls()).toEqual(['BEGIN', `${LIVE_PARENT} for update`, 'ROLLBACK']);
    });

    it('throws when INSERT … RETURNING yields no row', async () => {
      recorder.respondWith(parentRow);

      expect(lines.createForParent(ORDER_ID, { item: 'x', qty: 1 })).rejects.toBeInstanceOf(
        InternalServerError,
      );
    });
  });

  describe('updateForParent', () => {
    it('locks header then detail, updates, audits with the header, touches the header', async () => {
      recorder.respondWith(
        parentRow,
        [rowOf(testOrderLines, aLine(LINE_A))],
        [rowOf(testOrderLines, aLine(LINE_A, { qty: 5 }))],
      );

      const updated = await lines.updateForParent(ORDER_ID, LINE_A, { qty: 5 });

      expect(updated?.qty).toBe(5);
      expect(sqls()[2]).toContain(
        'where ("test_order_lines"."order_id" = $1 and "test_order_lines"."id" = $2) order by "test_order_lines"."id" for update',
      );
      expect(sqls()[3]).toStartWith(
        'update "test_order_lines" set "qty" = $1, "updated_at" = now(), "updated_by" = $2',
      );
      expect(audits()).toEqual([
        [
          'test_order_lines',
          LINE_A,
          'UPDATE',
          JSON.stringify({ qty: { from: 1, to: 5 } }),
          'system',
          null,
          'test_orders',
          ORDER_ID,
        ],
      ]);
      expect(sqls().at(-2)).toBe(TOUCH_PARENT);
    });

    it('returns null for a detail of another header (IDOR) without writing', async () => {
      recorder.respondWith(parentRow);

      expect(await lines.updateForParent(ORDER_ID, LINE_B, { qty: 5 })).toBeNull();
      expect(sqls()).toHaveLength(4);
    });

    it('writes nothing and does not touch the header when nothing changes', async () => {
      recorder.respondWith(parentRow, [rowOf(testOrderLines, aLine(LINE_A))]);

      await lines.updateForParent(ORDER_ID, LINE_A, { qty: 1 });

      expect(sqls()).not.toContain(TOUCH_PARENT);
      expect(audits()).toEqual([]);
    });
  });

  describe('deleteForParent', () => {
    it('hard-deletes, records a snapshot with the header and touches the header', async () => {
      recorder.respondWith(parentRow, [rowOf(testOrderLines, aLine(LINE_A))]);

      expect(await lines.deleteForParent(ORDER_ID, LINE_A)).toBe(true);
      expect(sqls()[3]).toBe('delete from "test_order_lines" where "test_order_lines"."id" = $1');
      const audit = audits().at(0);
      expect(audit?.[2]).toBe('DELETE');
      expect(JSON.parse(audit?.[3] as string)).toMatchObject({
        id: LINE_A,
        order_id: ORDER_ID,
        qty: 1,
      });
      expect(audit?.slice(6)).toEqual(['test_orders', ORDER_ID]);
      expect(sqls().at(-2)).toBe(TOUCH_PARENT);
    });

    it('returns false when the detail is not under this header', async () => {
      recorder.respondWith(parentRow);

      expect(await lines.deleteForParent(ORDER_ID, LINE_A)).toBe(false);
      expect(sqls()).toHaveLength(4);
    });
  });

  describe('syncForParent', () => {
    it('deletes missing details, updates changed ones, inserts new ones — in one transaction', async () => {
      recorder.respondWith(
        parentRow,
        [rowOf(testOrderLines, aLine(LINE_A)), rowOf(testOrderLines, aLine(LINE_B))],
        [], // delete B
        [], // audit DELETE B
        [rowOf(testOrderLines, aLine(LINE_A, { qty: 9 }))], // update A
        [], // audit UPDATE A
        [rowOf(testOrderLines, aLine('0192f1d0-0000-7000-8000-00000000000c'))], // insert C
      );

      await lines.syncForParent(ORDER_ID, [
        { id: LINE_A, qty: 9 },
        { item: 'item-c', qty: 2 },
      ]);

      expect(sqls().map((sql) => sql.split(' ').slice(0, 3).join(' '))).toEqual([
        'BEGIN',
        'select "id" from',
        'select "id", "order_id",',
        'delete from "test_order_lines"',
        'insert into "record_changes"',
        'update "test_order_lines" set',
        'insert into "record_changes"',
        'insert into "test_order_lines"',
        'update "test_orders" set',
        'select "id", "order_id",',
        'COMMIT',
      ]);
      expect(audits().map((params) => [params[1], params[2]])).toEqual([
        [LINE_B, 'DELETE'],
        [LINE_A, 'UPDATE'],
      ]);
    });

    it('does not touch the header when the list is unchanged', async () => {
      recorder.respondWith(parentRow, [rowOf(testOrderLines, aLine(LINE_A))]);

      await lines.syncForParent(ORDER_ID, [{ id: LINE_A, qty: 1 }]);

      expect(sqls()).not.toContain(TOUCH_PARENT);
    });

    it('rejects an id that is not a detail of this header (NotFoundError, rolled back)', async () => {
      recorder.respondWith(parentRow, [rowOf(testOrderLines, aLine(LINE_A))]);

      const sync = lines.syncForParent(ORDER_ID, [{ id: LINE_B, qty: 1 }]);

      expect(sync).rejects.toBeInstanceOf(NotFoundError);
      await sync.catch(() => undefined);
      expect(sqls().at(-1)).toBe('ROLLBACK');
      expect(sqls().some((sql) => sql.startsWith('delete') || sql.startsWith('update'))).toBe(
        false,
      );
    });

    it('rejects the same id twice (BadRequestError)', async () => {
      recorder.respondWith(parentRow, [rowOf(testOrderLines, aLine(LINE_A))]);

      expect(
        lines.syncForParent(ORDER_ID, [
          { id: LINE_A, qty: 1 },
          { id: LINE_A, qty: 2 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  it('refuses a parent column that is not a column of the detail table', () => {
    class Misconfigured extends ChildRepository<typeof testOrderLines, typeof testOrders> {
      constructor() {
        super(testOrderLines, testOrders, testOrders.code, recorder.txHost);
      }
    }

    expect(() => new Misconfigured()).toThrow('parentColumn is not a column of the table');
  });
});
