import { describe, expect, it } from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';
import { NotFoundError } from '../../src/core/errors';
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
  testOrders,
  TestEventsRepository,
  TestOrderLinesRepository,
  TestOrdersRepository,
} from '../helpers/repository-fixtures';

/**
 * The data layer on a real PostgreSQL (plan step 6.1): what the SQL recorder of the unit tests
 * cannot prove — row locks, rollbacks, partial unique indexes and the audit trail as stored.
 */

const orders = new TestOrdersRepository(defaultTxHost);
const lines = new TestOrderLinesRepository(defaultTxHost);
const events = new TestEventsRepository(defaultTxHost);
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
