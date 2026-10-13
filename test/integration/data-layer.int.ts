import { describe, expect, it } from 'bun:test';
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '../../src/core/errors';
import { db } from '../../src/database/connection';
import { recordChanges, users } from '../../src/database/schema';
import { defaultTxHost } from '../../src/database/transaction-host';
import { runInTransaction } from '../../src/database/transactional.decorator';
import { isUniqueViolation } from '../../src/database/unique-violation';
import { UsersRepository } from '../../src/modules/users/users.repository';
import {
  asActor,
  INTEGRATION_ACTOR as ACTOR,
  INTEGRATION_REQUEST_ID,
  rejectionOf,
  unique,
} from '../helpers/integration';
import {
  testOrderNotes,
  testOrders,
  testOrderShipments,
  TestEventsRepository,
  TestOrderLinesRepository,
  TestOrderNotesRepository,
  TestOrdersRepository,
  TestOrderShipmentsRepository,
} from '../helpers/repository-fixtures';

/**
 * The data layer on a real PostgreSQL (plan step 6.1): what the SQL recorder of the unit tests
 * cannot prove — row locks, rollbacks, partial unique indexes and the audit trail as stored.
 */

const orders = new TestOrdersRepository(defaultTxHost);
const lines = new TestOrderLinesRepository(defaultTxHost);
const events = new TestEventsRepository(defaultTxHost);
const notes = new TestOrderNotesRepository(defaultTxHost);
const shipments = new TestOrderShipmentsRepository(defaultTxHost);

/** Notes whose parent order must have been created by `owner` (ownership through parentScope). */
class ScopedNotes extends TestOrderNotesRepository {
  constructor(private readonly owner: string) {
    super(defaultTxHost);
  }

  protected override parentScope(): SQL | undefined {
    return eq(testOrders.createdBy, this.owner);
  }
}

/** Notes that refuse writes while the order's note says `submitted`. */
class SubmittedLockedNotes extends TestOrderNotesRepository {
  constructor() {
    super(defaultTxHost);
  }

  protected override assertParentWritable(parent: typeof testOrders.$inferSelect): void {
    if (parent.note === 'submitted') throw new ConflictError();
  }
}
const usersRepository = new UsersRepository();

const historyOf = (table: string, recordId: string) =>
  db
    .select()
    .from(recordChanges)
    .where(and(eq(recordChanges.tableName, table), eq(recordChanges.recordId, recordId)))
    .orderBy(asc(recordChanges.id));

describe('BaseRepository on PostgreSQL', () => {
  it('stores an update and its audit entry together, with the actor and redacted columns', async () => {
    const order = await asActor(() =>
      orders.create({ code: unique('A'), note: 'n1', secret: 's1' }),
    );
    const updated = await asActor(() => orders.updateById(order.id, { note: 'n2', secret: 's2' }));

    expect(updated).toMatchObject({ note: 'n2', secret: 's2', createdBy: ACTOR, updatedBy: ACTOR });
    const history = await historyOf('test_orders', order.id);
    expect(history).toHaveLength(1);
    expect(history.at(0)).toMatchObject({
      action: 'UPDATE',
      actor: ACTOR,
      requestId: INTEGRATION_REQUEST_ID,
      changes: {
        note: { from: 'n1', to: 'n2' },
        secret: { from: '[REDACTED]', to: '[REDACTED]' },
      },
    });
  });

  it('rolls back the update and its audit entry when the transaction fails later', async () => {
    const order = await asActor(() => orders.create({ code: unique('B'), note: 'kept' }));

    const failure = await rejectionOf(
      asActor(() =>
        runInTransaction(async () => {
          await orders.updateById(order.id, { note: 'rolled back' });
          throw new Error('fails after the update');
        }),
      ),
    );

    expect(failure).toEqual(new Error('fails after the update'));
    expect((await orders.findById(order.id))?.note).toBe('kept');
    expect(await historyOf('test_orders', order.id)).toEqual([]);
  });

  it('soft-deletes and restores, each with its audit entry', async () => {
    const order = await asActor(() => orders.create({ code: unique('C') }));

    expect(await asActor(() => orders.softDeleteById(order.id))).not.toBeNull();
    expect(await orders.findById(order.id)).toBeNull();
    const stored = await db.select().from(testOrders).where(eq(testOrders.id, order.id));
    expect(stored.at(0)?.deletedAt).not.toBeNull();

    expect(await asActor(() => orders.restoreById(order.id))).toMatchObject({ deletedAt: null });
    expect(await orders.findById(order.id)).not.toBeNull();
    expect((await historyOf('test_orders', order.id)).map((entry) => entry.action)).toEqual([
      'SOFT_DELETE',
      'RESTORE',
    ]);
  });

  it('serializes concurrent updates of one row (row lock): the audit trail is one unbroken chain', async () => {
    const order = await asActor(() => orders.create({ code: unique('D'), note: 'v0' }));

    await Promise.all(
      ['v1', 'v2', 'v3', 'v4'].map((note) => asActor(() => orders.updateById(order.id, { note }))),
    );

    const chain = (await historyOf('test_orders', order.id)).map(
      (entry) => (entry.changes as { note: { from: string; to: string } }).note,
    );
    expect(chain).toHaveLength(4);
    // Each update saw the previous one: no lost update, no audit entry from a stale read.
    expect(chain.map((change) => change.from)).toEqual([
      'v0',
      ...chain.slice(0, -1).map((change) => change.to),
    ]);
    expect((await orders.findById(order.id))?.note).toBe(chain.at(-1)?.to ?? 'no update');
  });
});

describe('ChildRepository on PostgreSQL', () => {
  it('syncs a header’s details in one transaction: update, insert, delete — audited under the header', async () => {
    const header = await asActor(() => orders.create({ code: unique('E') }));
    const keep = await asActor(() => lines.createForParent(header.id, { item: 'keep', qty: 1 }));
    const drop = await asActor(() => lines.createForParent(header.id, { item: 'drop', qty: 2 }));

    const synced = await asActor(() =>
      lines.syncForParent(header.id, [
        { id: keep.id, qty: 5 },
        { item: 'new', qty: 3 },
      ]),
    );

    expect(synced.map(({ item, qty }) => ({ item, qty }))).toEqual([
      { item: 'keep', qty: 5 },
      { item: 'new', qty: 3 },
    ]);
    const detailHistory = await db
      .select()
      .from(recordChanges)
      .where(
        and(eq(recordChanges.parentTable, 'test_orders'), eq(recordChanges.parentId, header.id)),
      )
      .orderBy(asc(recordChanges.id));
    expect(detailHistory.map(({ action, recordId }) => [action, recordId])).toEqual([
      ['DELETE', drop.id],
      ['UPDATE', keep.id],
    ]);
    expect((await orders.findById(header.id))?.updatedAt.epochMilliseconds).toBeGreaterThan(
      header.updatedAt.epochMilliseconds,
    );
  });

  it('rolls the whole sync back when one item is not a detail of the header', async () => {
    const header = await asActor(() => orders.create({ code: unique('F') }));
    const line = await asActor(() => lines.createForParent(header.id, { item: 'only', qty: 1 }));
    const other = await asActor(() => orders.create({ code: unique('G') }));
    const foreign = await asActor(() =>
      lines.createForParent(other.id, { item: 'foreign', qty: 1 }),
    );

    const failure = await rejectionOf(
      asActor(() =>
        lines.syncForParent(header.id, [
          { id: line.id, qty: 9 },
          { id: foreign.id, qty: 9 },
        ]),
      ),
    );

    expect(failure).toBeInstanceOf(NotFoundError);
    expect((await lines.findAllForParent(header.id)).map(({ qty }) => qty)).toEqual([1]);
  });

  it('hides the details of a soft-deleted header', async () => {
    const header = await asActor(() => orders.create({ code: unique('H') }));
    await asActor(() => lines.createForParent(header.id, { item: 'x', qty: 1 }));
    await asActor(() => orders.softDeleteById(header.id));

    expect(await rejectionOf(lines.findAllForParent(header.id))).toBeInstanceOf(NotFoundError);
  });
});

describe('DependentRepository on PostgreSQL (plan D33)', () => {
  it('hides children of a deleted parent without touching them; restore brings back only the live ones', async () => {
    const parent = await asActor(() => orders.create({ code: unique('I') }));
    const kept = await asActor(() => notes.createForParent(parent.id, { body: 'kept' }));
    const removed = await asActor(() => notes.createForParent(parent.id, { body: 'removed' }));
    await asActor(() => notes.softDeleteById(removed.id));

    await asActor(() => orders.softDeleteById(parent.id));
    expect(await notes.findById(kept.id)).toBeNull();
    expect(
      await rejectionOf(notes.findPageForParent(parent.id, { page: 1, perPage: 10 })),
    ).toBeInstanceOf(NotFoundError);
    expect(await asActor(() => notes.updateById(kept.id, { body: 'x' }))).toBeNull();
    expect(
      await rejectionOf(asActor(() => notes.createForParent(parent.id, { body: 'x' }))),
    ).toBeInstanceOf(NotFoundError);
    const stored = await db.select().from(testOrderNotes).where(eq(testOrderNotes.id, kept.id));
    expect(stored.at(0)?.deletedAt).toBeNull();

    await asActor(() => orders.restoreById(parent.id));
    const page = await notes.findPageForParent(parent.id, { page: 1, perPage: 10 });
    expect(page.map((note) => note.body)).toEqual(['kept']);
    expect(await notes.countForParent(parent.id)).toBe(1);
  });

  it('audits changes under the parent and never moves a row to another parent', async () => {
    const parent = await asActor(() => orders.create({ code: unique('J') }));
    const other = await asActor(() => orders.create({ code: unique('K') }));
    const note = await asActor(() => notes.createForParent(parent.id, { body: 'v1' }));

    const updated = await asActor(() =>
      notes.updateById(note.id, { body: 'v2', orderId: other.id }),
    );

    expect(updated).toMatchObject({ body: 'v2', orderId: parent.id });
    const history = await historyOf('test_order_notes', note.id);
    expect(
      history.map(({ action, parentTable, parentId }) => [action, parentTable, parentId]),
    ).toEqual([['UPDATE', 'test_orders', parent.id]]);
  });

  it('parentScope() hides another owner’s parent from every read and write (404, not 403)', async () => {
    const parent = await asActor(() => orders.create({ code: unique('L') }));
    const note = await asActor(() => notes.createForParent(parent.id, { body: 'mine' }));
    const strangers = new ScopedNotes('user:someone-else');
    const owners = new ScopedNotes(ACTOR);

    expect(await strangers.findById(note.id)).toBeNull();
    expect(
      await rejectionOf(strangers.findPageForParent(parent.id, { page: 1, perPage: 10 })),
    ).toBeInstanceOf(NotFoundError);
    expect(
      await rejectionOf(asActor(() => strangers.createForParent(parent.id, { body: 'x' }))),
    ).toBeInstanceOf(NotFoundError);
    expect(await asActor(() => strangers.updateById(note.id, { body: 'x' }))).toBeNull();
    expect(await asActor(() => strangers.softDeleteById(note.id))).toBeNull();
    expect((await owners.findById(note.id))?.body).toBe('mine');
  });

  it('assertParentWritable() refuses writes by the parent’s state and leaves nothing behind', async () => {
    const parent = await asActor(() => orders.create({ code: unique('M'), note: 'submitted' }));
    const guarded = new SubmittedLockedNotes();

    expect(
      await rejectionOf(asActor(() => guarded.createForParent(parent.id, { body: 'x' }))),
    ).toBeInstanceOf(ConflictError);
    expect(await notes.countForParent(parent.id)).toBe(0);
  });

  it('1:1: concurrent upserts of one parent leave one live row; the later ones update it', async () => {
    const parent = await asActor(() => orders.create({ code: unique('N') }));

    const results = await Promise.all(
      ['a', 'b', 'c', 'd'].map((carrier) =>
        asActor(() => shipments.upsertForParent(parent.id, { carrier })),
      ),
    );

    expect(results.filter((result) => result.created)).toHaveLength(1);
    const live = await db
      .select()
      .from(testOrderShipments)
      .where(and(eq(testOrderShipments.orderId, parent.id), isNull(testOrderShipments.deletedAt)));
    expect(live).toHaveLength(1);
    expect(['a', 'b', 'c', 'd']).toContain(live.at(0)?.carrier ?? 'none');
  });

  it('1:1: after a delete a new row is allowed; restoring the old one then is a unique violation', async () => {
    const parent = await asActor(() => orders.create({ code: unique('O') }));
    const first = await asActor(() => shipments.upsertForParent(parent.id, { carrier: 'old' }));
    await asActor(() => shipments.softDeleteForParent(parent.id));
    const second = await asActor(() => shipments.upsertForParent(parent.id, { carrier: 'new' }));

    expect(second.created).toBe(true);
    const conflict = await rejectionOf(asActor(() => shipments.restoreById(first.row.id)));
    expect(isUniqueViolation(conflict)).toBe(true);
    expect((await shipments.findOneForParent(parent.id))?.carrier).toBe('new');
  });

  it('concurrent child writes and a parent delete on one parent finish without a deadlock', async () => {
    const parent = await asActor(() => orders.create({ code: unique('P') }));
    const created = await Promise.all(
      [1, 2, 3, 4].map((n) => asActor(() => notes.createForParent(parent.id, { body: `n${n}` }))),
    );

    const outcomes = await Promise.allSettled([
      ...created.map((note) => asActor(() => notes.updateById(note.id, { body: `${note.body}!` }))),
      asActor(() => orders.softDeleteById(parent.id)),
      ...created.map((note) => asActor(() => notes.softDeleteById(note.id))),
    ]);

    expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(await orders.findById(parent.id)).toBeNull();
  });
});

describe('activeUniqueIndex on PostgreSQL (users.email among live users)', () => {
  it('rejects a second live row with the same value, and allows it again after a soft delete', async () => {
    const email = `${unique('ada')}@example.com`;
    const input = { email, fullName: 'Ada', passwordHash: 'not-a-real-hash' };
    const first = await asActor(() => usersRepository.create(input));

    const duplicate = await rejectionOf(asActor(() => usersRepository.create(input)));
    expect(isUniqueViolation(duplicate)).toBe(true);

    await asActor(() => usersRepository.softDeleteById(first.id));
    const second = await asActor(() => usersRepository.create(input));
    expect(second.id).not.toBe(first.id);
    const live = await db.select().from(users).where(eq(users.email, email));
    expect(live.filter((row) => row.deletedAt === null)).toHaveLength(1);
  });
});

describe('AppendOnlyRepository on PostgreSQL', () => {
  it('appends with a sequential id and pages newest first', async () => {
    const kind = unique('event');
    const appended = [];
    for (const step of ['one', 'two', 'three']) {
      appended.push(await events.append({ kind: `${kind}-${step}` }));
    }

    expect(appended.map((event) => event.id)).toEqual(
      [...appended.map((event) => event.id)].sort((a, b) => a - b),
    );
    const page = await events.findPage({ page: 1, perPage: 3 });
    expect(page.map((event) => event.kind)).toEqual([
      `${kind}-three`,
      `${kind}-two`,
      `${kind}-one`,
    ]);
  });
});
