/**
 * Test-only tables and repositories for the generic data-layer behaviour (plan step 2.5): a header
 * (`test_orders`, standalone shape with soft delete), its detail (`test_order_lines`) and a record
 * table (`test_events`). Not exported from the schema barrel, so drizzle-kit never migrates them.
 */
import { index, integer, text, varchar } from 'drizzle-orm/pg-core';
import { Temporal } from 'temporal-polyfill';
import { AppendOnlyRepository } from '../../src/database/append-only.repository';
import { BaseRepository } from '../../src/database/base.repository';
import { ChildRepository } from '../../src/database/child.repository';
import { ReadOnlyRepository } from '../../src/database/read-only.repository';
import { refRoles } from '../../src/database/schema/reference/ref-roles.schema';
import {
  auditColumns,
  parentReference,
  sequentialPrimaryKey,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../../src/database/schema/columns';
import { appTable } from '../../src/database/schema/schemas';
import type { TransactionHost } from '../../src/database/transaction-host';

export const testOrders = appTable('test_orders', {
  id: uuidPrimaryKey(),
  code: varchar('code', { length: 50 }).notNull(),
  note: text('note'),
  secret: text('secret'),
  ...timestamps(),
  ...auditColumns(),
  ...softDelete(),
});

export const testOrderLines = appTable(
  'test_order_lines',
  {
    id: uuidPrimaryKey(),
    orderId: parentReference('order_id', () => testOrders.id),
    item: varchar('item', { length: 50 }).notNull(),
    qty: integer('qty').notNull(),
    ...timestamps(),
    ...auditColumns(),
  },
  (table) => [index('test_order_lines_order_idx').on(table.orderId)],
);

/** A record table (append-only, sequential key). */
export const testEvents = appTable('test_events', {
  id: sequentialPrimaryKey(),
  kind: varchar('kind', { length: 50 }).notNull(),
  ...timestamps(),
});

export type TestOrder = typeof testOrders.$inferSelect;
export type TestOrderLine = typeof testOrderLines.$inferSelect;

export class TestOrdersRepository extends BaseRepository<typeof testOrders> {
  constructor(txHost: TransactionHost) {
    super(testOrders, txHost, { redact: ['secret'] });
  }
}

export class TestOrderLinesRepository extends ChildRepository<
  typeof testOrderLines,
  typeof testOrders
> {
  constructor(txHost: TransactionHost) {
    super(testOrderLines, testOrders, testOrderLines.orderId, txHost);
  }
}

export class TestEventsRepository extends AppendOnlyRepository<typeof testEvents> {
  constructor(txHost: TransactionHost) {
    super(testEvents, txHost);
  }
}

export class RefRolesRepository extends ReadOnlyRepository<typeof refRoles> {
  constructor(txHost: TransactionHost) {
    super(refRoles, txHost);
  }
}

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');

export const ORDER_ID = '0192f1d0-0000-7000-8000-000000000001';
export const OTHER_ORDER_ID = '0192f1d0-0000-7000-8000-000000000002';

export const anOrder = (overrides: Partial<TestOrder> = {}): TestOrder => ({
  id: ORDER_ID,
  code: 'ORD-1',
  note: null,
  secret: 'top-secret',
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'user:creator',
  updatedBy: 'user:creator',
  deletedAt: null,
  ...overrides,
});

export const aLine = (id: string, overrides: Partial<TestOrderLine> = {}): TestOrderLine => ({
  id,
  orderId: ORDER_ID,
  item: `item-${id.slice(-1)}`,
  qty: 1,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'user:creator',
  updatedBy: 'user:creator',
  ...overrides,
});
