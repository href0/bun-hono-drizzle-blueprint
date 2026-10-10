import { index, integer, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, parentReference, softDelete, timestamps, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';

/** Header: standalone shape (BaseRepository) — audited, soft-deleted. */
export const orders = appTable('orders', {
  id: uuidPrimaryKey(),
  code: varchar('code', { length: 50 }).notNull(),
  note: varchar('note', { length: 255 }),
  ...timestamps(),
  ...auditColumns(),
  ...softDelete(),
});

/** Detail: lives and dies with its header (ChildRepository) — no soft delete. */
export const orderItems = appTable(
  'order_items',
  {
    id: uuidPrimaryKey(),
    orderId: parentReference('order_id', () => orders.id),
    description: varchar('description', { length: 255 }).notNull(),
    quantity: integer('quantity').notNull(),
    ...timestamps(),
    ...auditColumns(),
  },
  (table) => [index('order_items_order_idx').on(table.orderId)],
);

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
