import { beforeEach, describe, expect, it } from 'bun:test';
import { OrdersRepository, OrderItemsRepository } from './orders.repository';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';

const HEADER_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const ITEM_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';

describe('OrdersRepository / OrderItemsRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const headers = new OrdersRepository(recorder.txHost);
  const items = new OrderItemsRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('headers: live rows only', async () => {
    expect(await headers.findById(HEADER_ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain('"orders"."deleted_at" is null');
  });

  it('items: reached only through their live header', async () => {
    recorder.respondWith([[HEADER_ID]]);

    expect(await items.findByIdForParent(HEADER_ID, ITEM_ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain('"orders"."deleted_at" is null');
    expect(recorder.statements.at(1)?.sql).toContain(
      'where ("order_items"."order_id" = $1 and "order_items"."id" = $2)',
    );
  });
});
