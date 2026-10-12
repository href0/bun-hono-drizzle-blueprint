import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';
import type { Order, OrderItem } from '../../database/schema';

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const ORDER: Order = {
  id: '0192f1d0-0000-7000-8000-000000000001',
  code: 'ORD-1',
  note: null,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};
const ITEM: OrderItem = {
  id: '0192f1d0-0000-7000-8000-00000000000a',
  orderId: ORDER.id,
  description: 'Widget',
  quantity: 2,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
};

const service: Partial<OrdersService> = {
  createOrder: async () => ORDER,
  getOrderById: async () => ORDER,
  listOrders: async () => ({ records: [ORDER], total: 21 }),
  updateOrder: async () => ORDER,
  deleteOrder: async () => undefined,
  restoreOrder: async () => ORDER,
  listItems: async () => [ITEM],
  addItem: async () => ITEM,
  updateItem: async () => ITEM,
  deleteItem: async () => undefined,
  syncItems: async () => [ITEM],
};

const controller = new OrdersController(service as OrdersService);
const next = (async () => undefined) as any;
const contextWith = (values: Record<string, unknown>): any => ({
  get: (key: string) => values[key],
  json: (data: unknown, status: number) => ({ data, status }),
});
const params = { validatedParams: { id: ORDER.id, childId: ITEM.id } };

type Result = { status: number; data: { data: unknown; meta?: Record<string, number> } };
const call = async (handler: keyof OrdersController, values: Record<string, unknown>) =>
  (await (controller[handler] as any)(contextWith(values), next)) as Result;

describe('OrdersController (Unit)', () => {
  it('header handlers return the shaped order with the right status', async () => {
    expect((await call('create', { validatedBody: { code: 'ORD-1' } })).status).toBe(201);
    expect((await call('getById', params)).data.data).toMatchObject({ code: 'ORD-1' });
    expect((await call('update', { ...params, validatedBody: { note: 'x' } })).status).toBe(200);
    expect((await call('remove', params)).data.data).toBeNull();
    expect((await call('restore', params)).status).toBe(200);
  });

  it('list returns pagination meta', async () => {
    const result = await call('list', { validatedQuery: { page: 2, perPage: 10 } });

    expect(result.data.meta).toEqual({
      current_page: 2,
      per_page: 10,
      total_items: 21,
      total_pages: 3,
    });
  });

  it('item handlers return shaped items with the right status', async () => {
    expect((await call('listItems', params)).data.data).toHaveLength(1);
    expect((await call('addItem', { ...params, validatedBody: ITEM })).status).toBe(201);
    expect((await call('updateItem', { ...params, validatedBody: { quantity: 3 } })).status).toBe(
      200,
    );
    expect((await call('deleteItem', params)).data.data).toBeNull();
    expect((await call('syncItems', { ...params, validatedBody: { items: [] } })).status).toBe(200);
  });
});
