import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, type SQL } from 'drizzle-orm';
import { ConflictError, InternalServerError, NotFoundError } from '../core/errors';
import { DependentRepository } from './dependent.repository';
import { createSqlRecorder, rowOf } from '../../test/helpers/sql-recorder';
import {
  anOrder,
  ORDER_ID,
  OTHER_ORDER_ID,
  TestOrderNotesRepository,
  testOrderNotes,
  testOrders,
  TestOrderShipmentsRepository,
  testOrderShipments,
  type TestOrderNote,
} from '../../test/helpers/repository-fixtures';

const NOTE_ID = '0192f1d0-0000-7000-8000-0000000000a1';
const AT = anOrder().createdAt;

const aNote = (overrides: Partial<TestOrderNote> = {}): TestOrderNote => ({
  id: NOTE_ID,
  orderId: ORDER_ID,
  body: 'first',
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'user:creator',
  updatedBy: 'user:creator',
  deletedAt: null,
  ...overrides,
});

type TestOrderShipment = typeof testOrderShipments.$inferSelect;

const aShipment = (
  carrier: string,
  overrides: Partial<TestOrderShipment> = {},
): TestOrderShipment => ({
  id: NOTE_ID,
  orderId: ORDER_ID,
  carrier,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'user:creator',
  updatedBy: 'user:creator',
  deletedAt: null,
  ...overrides,
});

const NOTE_COLUMNS =
  '"id", "order_id", "body", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"';
const ORDER_COLUMNS =
  '"id", "code", "note", "secret", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"';
const LIVE_PARENT_EXISTS =
  'exists (select 1 from "test_orders" where ("test_orders"."id" = "test_order_notes"."order_id" and "test_orders"."deleted_at" is null))';
const VISIBLE_PARENT = `select "id" from "test_orders" where ("test_orders"."id" = $1 and "test_orders"."deleted_at" is null)`;
const PARENT_LOCK = `select ${ORDER_COLUMNS} from "test_orders" where ("test_orders"."id" = $1 and "test_orders"."deleted_at" is null)`;
const PARENT_OF_ROW =
  'select "order_id" from "test_order_notes" where "test_order_notes"."id" = $1 limit $2';

const order = [rowOf(testOrders, anOrder())];
const parentIdRow = [[ORDER_ID]];
const note = (overrides: Partial<TestOrderNote> = {}) => [rowOf(testOrderNotes, aNote(overrides))];

describe('DependentRepository', () => {
  const recorder = createSqlRecorder();
  const notes = new TestOrderNotesRepository(recorder.txHost);
  const shipments = new TestOrderShipmentsRepository(recorder.txHost);
  const sqls = (): string[] => recorder.statements.map((statement) => statement.sql);
  const audits = (): unknown[][] =>
    recorder.statements
      .filter((statement) => statement.sql.startsWith('insert into "record_changes"'))
      .map((statement) => statement.params);

  beforeEach(() => {
    recorder.reset();
  });

  describe('reads only see live rows of a live parent', () => {
    it('findById scopes to the live row and an EXISTS on the live parent', async () => {
      recorder.respondWith(note());

      expect(await notes.findById(NOTE_ID)).toEqual(aNote());
      expect(recorder.statements).toEqual([
        {
          sql: `select ${NOTE_COLUMNS} from "test_order_notes" where ("test_order_notes"."deleted_at" is null and ${LIVE_PARENT_EXISTS} and "test_order_notes"."id" = $1) limit $2`,
          params: [NOTE_ID, 1],
        },
      ]);
    });

    it('findById is null when nothing matches (row deleted, or parent deleted / out of scope)', async () => {
      expect(await notes.findById(NOTE_ID)).toBeNull();
    });

    it('findPageForParent checks the parent, then pages its rows newest first', async () => {
      recorder.respondWith(parentIdRow, note());

      expect(await notes.findPageForParent(ORDER_ID, { page: 2, perPage: 10 })).toEqual([aNote()]);
      expect(recorder.statements.at(0)).toEqual({ sql: VISIBLE_PARENT, params: [ORDER_ID] });
      expect(recorder.statements.at(1)).toEqual({
        sql: `select ${NOTE_COLUMNS} from "test_order_notes" where ("test_order_notes"."deleted_at" is null and ${LIVE_PARENT_EXISTS} and "test_order_notes"."order_id" = $1) order by "test_order_notes"."created_at" desc, "test_order_notes"."id" desc limit $2 offset $3`,
        params: [ORDER_ID, 10, 10],
      });
    });

    it('findListForParent sorts, searches and counts the parent rows under the same conditions', async () => {
      recorder.respondWith(parentIdRow, parentIdRow, note(), [[1]]);

      const result = await notes.findListForParent(
        ORDER_ID,
        { page: 1, perPage: 10, sort: [{ field: 'body', direction: 'asc' }], q: 'late' },
        { sort: { body: testOrderNotes.body }, search: [testOrderNotes.body] },
      );

      expect(result).toEqual({ rows: [aNote()], total: 1 });
      const rowQueries = sqls().filter((sql) => !sql.startsWith('select "id" from "test_orders"'));
      const where = `where ("test_order_notes"."deleted_at" is null and ${LIVE_PARENT_EXISTS} and "test_order_notes"."order_id" = $1 and "test_order_notes"."body" ilike $2)`;
      expect(rowQueries).toEqual([
        `select ${NOTE_COLUMNS} from "test_order_notes" ${where} order by "test_order_notes"."body" asc, "test_order_notes"."id" asc limit $3`,
        `select count(*) from "test_order_notes" ${where}`,
      ]);
    });

    it('countForParent counts the live rows of the parent', async () => {
      recorder.respondWith(parentIdRow, [[3]]);

      expect(await notes.countForParent(ORDER_ID)).toBe(3);
      expect(sqls()[1]).toStartWith('select count(*) from "test_order_notes"');
    });

    it('countForParent is 0 when the database returns no row', async () => {
      recorder.respondWith(parentIdRow);

      expect(await notes.countForParent(ORDER_ID)).toBe(0);
    });

    it('findOneForParent returns the 1:1 row, or null when the parent has none', async () => {
      recorder.respondWith(parentIdRow, [rowOf(testOrderShipments, aShipment('acme'))]);
      expect((await shipments.findOneForParent(ORDER_ID))?.carrier).toBe('acme');
      expect(sqls()[1]).toEndWith('"test_order_shipments"."order_id" = $1) limit $2');

      recorder.reset();
      recorder.respondWith(parentIdRow);
      expect(await shipments.findOneForParent(ORDER_ID)).toBeNull();
    });

    it('every parent-scoped read is NotFoundError for an invisible parent, before any row query', async () => {
      for (const read of [
        () => notes.findPageForParent(ORDER_ID, { page: 1, perPage: 10 }),
        () => notes.countForParent(ORDER_ID),
        () => shipments.findOneForParent(ORDER_ID),
      ]) {
        recorder.reset();
        const attempt = read();
        expect(attempt).rejects.toBeInstanceOf(NotFoundError);
        await attempt.catch(() => undefined);
        expect(sqls()).toEqual([VISIBLE_PARENT]);
      }
    });
  });

  describe('createForParent', () => {
    it('locks the parent FOR SHARE, inserts under it with the actor; re-parenting is ignored', async () => {
      recorder.respondWith(order, note());

      await notes.createForParent(ORDER_ID, { body: 'first', orderId: OTHER_ORDER_ID });

      expect(sqls()).toEqual([
        'BEGIN',
        `${PARENT_LOCK} for share`,
        expect.stringMatching(/^insert into "test_order_notes"/) as string,
        'COMMIT',
      ]);
      expect(recorder.statements.at(2)?.params).toContain(ORDER_ID);
      expect(recorder.statements.at(2)?.params).not.toContain(OTHER_ORDER_ID);
      expect(audits()).toEqual([]);
    });

    it('rolls back with NotFoundError when the parent is not visible', async () => {
      const create = notes.createForParent(ORDER_ID, { body: 'x' });

      expect(create).rejects.toBeInstanceOf(NotFoundError);
      await create.catch(() => undefined);
      expect(sqls()).toEqual(['BEGIN', `${PARENT_LOCK} for share`, 'ROLLBACK']);
    });

    it('throws when INSERT … RETURNING yields no row', async () => {
      recorder.respondWith(order);

      expect(notes.createForParent(ORDER_ID, { body: 'x' })).rejects.toBeInstanceOf(
        InternalServerError,
      );
    });
  });

  describe('updateById', () => {
    it('reads the parent id, locks parent then row, updates and audits with the parent', async () => {
      recorder.respondWith(parentIdRow, order, note(), note({ body: 'second' }));

      const updated = await notes.updateById(NOTE_ID, { body: 'second', orderId: OTHER_ORDER_ID });

      expect(updated?.body).toBe('second');
      expect(sqls().slice(0, 4)).toEqual([
        'BEGIN',
        PARENT_OF_ROW,
        `${PARENT_LOCK} for share`,
        `select ${NOTE_COLUMNS} from "test_order_notes" where ("test_order_notes"."id" = $1 and "test_order_notes"."deleted_at" is null) order by "test_order_notes"."id" for update`,
      ]);
      expect(sqls()[4]).toStartWith(
        'update "test_order_notes" set "body" = $1, "updated_at" = now(), "updated_by" = $2',
      );
      expect(recorder.statements.at(4)?.params).not.toContain(OTHER_ORDER_ID);
      expect(audits()).toEqual([
        [
          'test_order_notes',
          NOTE_ID,
          'UPDATE',
          JSON.stringify({ body: { from: 'first', to: 'second' } }),
          'system',
          null,
          'test_orders',
          ORDER_ID,
        ],
      ]);
    });

    it('is null for an unknown id, after one query', async () => {
      expect(await notes.updateById(NOTE_ID, { body: 'x' })).toBeNull();
      expect(sqls()).toEqual(['BEGIN', PARENT_OF_ROW, 'COMMIT']);
    });

    it('is null without locking the row when the parent is not visible', async () => {
      recorder.respondWith(parentIdRow);

      expect(await notes.updateById(NOTE_ID, { body: 'x' })).toBeNull();
      expect(sqls()).toEqual(['BEGIN', PARENT_OF_ROW, `${PARENT_LOCK} for share`, 'COMMIT']);
    });

    it('is null for a deleted row, and writes nothing when nothing changes', async () => {
      recorder.respondWith(parentIdRow, order);
      expect(await notes.updateById(NOTE_ID, { body: 'x' })).toBeNull();

      recorder.reset();
      recorder.respondWith(parentIdRow, order, note());
      expect(await notes.updateById(NOTE_ID, { body: 'first' })).toEqual(aNote());
      expect(sqls().some((sql) => sql.startsWith('update'))).toBe(false);
      expect(audits()).toEqual([]);
    });
  });

  describe('softDeleteById / restoreById', () => {
    it('soft-deletes the live row with an audit entry under the parent', async () => {
      recorder.respondWith(parentIdRow, order, note(), note({ deletedAt: AT }));

      expect((await notes.softDeleteById(NOTE_ID))?.deletedAt).toEqual(AT);
      expect(sqls()[4]).toStartWith('update "test_order_notes" set "updated_at" = now()');
      expect(sqls()[4]).toContain('"deleted_at" = now()');
      expect(audits().map((params) => [params[2], params[6], params[7]])).toEqual([
        ['SOFT_DELETE', 'test_orders', ORDER_ID],
      ]);
    });

    it('softDeleteById is null when the row is not visible', async () => {
      expect(await notes.softDeleteById(NOTE_ID)).toBeNull();
    });

    it('restores a deleted row of a visible parent, with an audit entry', async () => {
      recorder.respondWith(parentIdRow, order, note({ deletedAt: AT }), note());

      expect((await notes.restoreById(NOTE_ID))?.deletedAt).toBeNull();
      expect(sqls()[3]).toContain('"test_order_notes"."deleted_at" is not null');
      expect(audits().map((params) => [params[2], params[6], params[7]])).toEqual([
        ['RESTORE', 'test_orders', ORDER_ID],
      ]);
    });

    it('restoreById is null while the parent is deleted, and for a row that is not deleted', async () => {
      recorder.respondWith(parentIdRow);
      expect(await notes.restoreById(NOTE_ID)).toBeNull();
      expect(sqls().some((sql) => sql.includes('for update'))).toBe(false);

      recorder.reset();
      recorder.respondWith(parentIdRow, order);
      expect(await notes.restoreById(NOTE_ID)).toBeNull();
    });
  });

  describe('1:1 rows (upsertForParent / softDeleteForParent)', () => {
    const shipment = (carrier: string, overrides: Partial<TestOrderShipment> = {}) => [
      rowOf(testOrderShipments, aShipment(carrier, overrides)),
    ];

    it('inserts when the parent has no live row — parent locked FOR UPDATE', async () => {
      recorder.respondWith(order, [], shipment('acme'));

      const result = await shipments.upsertForParent(ORDER_ID, { carrier: 'acme' });

      expect(result.created).toBe(true);
      expect(result.row.carrier).toBe('acme');
      expect(sqls()[1]).toBe(`${PARENT_LOCK} for update`);
      expect(sqls()[2]).toContain(
        'where ("test_order_shipments"."order_id" = $1 and "test_order_shipments"."deleted_at" is null) order by "test_order_shipments"."id" for update',
      );
      expect(sqls()[3]).toStartWith('insert into "test_order_shipments"');
    });

    it('updates the live row otherwise, with an audit entry under the parent', async () => {
      recorder.respondWith(order, shipment('acme'), shipment('other'));

      const result = await shipments.upsertForParent(ORDER_ID, { carrier: 'other' });

      expect(result).toMatchObject({ created: false, row: { carrier: 'other' } });
      expect(audits().map((params) => [params[2], params[6]])).toEqual([['UPDATE', 'test_orders']]);
    });

    it('upsert is NotFoundError when the parent is not visible', async () => {
      expect(shipments.upsertForParent(ORDER_ID, { carrier: 'x' })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('softDeleteForParent deletes the live row, null when there is none', async () => {
      recorder.respondWith(order, shipment('acme'), shipment('acme', { deletedAt: AT }));
      expect((await shipments.softDeleteForParent(ORDER_ID))?.deletedAt).toEqual(AT);
      expect(audits().map((params) => params[2])).toEqual(['SOFT_DELETE']);

      recorder.reset();
      recorder.respondWith(order);
      expect(await shipments.softDeleteForParent(ORDER_ID)).toBeNull();
    });

    it('softDeleteForParent is NotFoundError when the parent is not visible', async () => {
      expect(shipments.softDeleteForParent(ORDER_ID)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('parentScope()', () => {
    class OwnedNotes extends TestOrderNotesRepository {
      protected override parentScope(): SQL | undefined {
        return eq(testOrders.createdBy, 'user:owner');
      }
    }
    const owned = new OwnedNotes(recorder.txHost);

    it('joins every read, the parent check and the write lock', async () => {
      await owned.findById(NOTE_ID);
      await owned.findPageForParent(ORDER_ID, { page: 1, perPage: 5 }).catch(() => undefined);
      await owned.createForParent(ORDER_ID, { body: 'x' }).catch(() => undefined);

      const scope = '"test_orders"."created_by" = $';
      expect(sqls().filter((sql) => sql !== 'BEGIN' && sql !== 'ROLLBACK')).toEqual([
        expect.stringContaining(scope) as string, // findById EXISTS
        expect.stringContaining(scope) as string, // parent check
        expect.stringContaining(scope) as string, // parent lock
      ]);
      expect(recorder.statements.at(0)?.params).toContain('user:owner');
    });
  });

  describe('assertParentWritable()', () => {
    class LockedNotes extends TestOrderNotesRepository {
      readonly seen: unknown[] = [];

      protected override assertParentWritable(parent: typeof testOrders.$inferSelect): void {
        this.seen.push(parent);
        if (parent.note === 'submitted') throw new ConflictError();
      }
    }

    it('receives the locked parent and refuses every write before the row is locked', async () => {
      const locked = new LockedNotes(recorder.txHost);
      const submitted = [rowOf(testOrders, anOrder({ note: 'submitted' }))];
      const lockedShipments = new (class extends TestOrderShipmentsRepository {
        protected override assertParentWritable(): void {
          throw new ConflictError();
        }
      })(recorder.txHost);

      const writes: [() => Promise<unknown>, unknown[][][]][] = [
        [() => locked.createForParent(ORDER_ID, { body: 'x' }), [submitted]],
        [() => locked.updateById(NOTE_ID, { body: 'x' }), [parentIdRow, submitted]],
        [() => locked.softDeleteById(NOTE_ID), [parentIdRow, submitted]],
        [() => locked.restoreById(NOTE_ID), [parentIdRow, submitted]],
        [() => lockedShipments.upsertForParent(ORDER_ID, { carrier: 'x' }), [order]],
        [() => lockedShipments.softDeleteForParent(ORDER_ID), [order]],
      ];
      for (const [write, responses] of writes) {
        recorder.reset();
        recorder.respondWith(...responses);
        const attempt = write();
        expect(attempt).rejects.toBeInstanceOf(ConflictError);
        await attempt.catch(() => undefined);
        expect(sqls().at(-1)).toBe('ROLLBACK');
        expect(
          sqls().some((sql) => sql.includes('"test_order_notes"') && sql.endsWith('for update')),
        ).toBe(false);
        expect(sqls().some((sql) => sql.startsWith('insert') || sql.startsWith('update'))).toBe(
          false,
        );
      }
      expect(locked.seen.at(0)).toEqual(anOrder({ note: 'submitted' }));
    });

    it('is not called by reads', async () => {
      const locked = new LockedNotes(recorder.txHost);
      recorder.respondWith(parentIdRow);

      await locked.findPageForParent(ORDER_ID, { page: 1, perPage: 5 });
      await locked.findById(NOTE_ID);

      expect(locked.seen).toEqual([]);
    });
  });

  it('refuses a parent column that is not a column of the table', () => {
    class Misconfigured extends DependentRepository<typeof testOrderNotes, typeof testOrders> {
      constructor() {
        super(testOrderNotes, testOrders, testOrders.code, recorder.txHost);
      }
    }

    expect(() => new Misconfigured()).toThrow('parentColumn is not a column of the table');
  });
});
