import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../core/errors';
import { OrdersService } from './orders.service';
import type { OrdersRepository, OrderItemsRepository } from './orders.repository';
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

const serviceWith = (
  headers: Partial<OrdersRepository> = {},
  items: Partial<OrderItemsRepository> = {},
): OrdersService => new OrdersService(headers as OrdersRepository, items as OrderItemsRepository);

describe('OrdersService (Unit)', () => {
  it('creates, gets and lists headers', async () => {
    let pageQuery: unknown;
    const service = serviceWith({
      create: async () => ORDER,
      findById: async () => ORDER,
      findPage: async (query) => {
        pageQuery = query;
        return [ORDER];
      },
      count: async () => 1,
    });

    expect(await service.createOrder({ code: 'ORD-1' })).toEqual(ORDER);
    expect(await service.getOrderById(ORDER.id)).toEqual(ORDER);
    expect(await service.listOrders({ page: 2, perPage: 5 })).toEqual({
      records: [ORDER],
      total: 1,
    });
    expect(pageQuery).toEqual({ page: 2, perPage: 5 });
  });

  it('updates, soft-deletes and restores headers', async () => {
    const service = serviceWith({
      updateById: async () => ({ ...ORDER, note: 'x' }),
      softDeleteById: async () => ORDER,
      restoreById: async () => ORDER,
    });

    expect((await service.updateOrder(ORDER.id, { note: 'x' })).note).toBe('x');
    await service.deleteOrder(ORDER.id);
    expect(await service.restoreOrder(ORDER.id)).toEqual(ORDER);
  });

  it('maps a missing header to NotFoundError on every header operation', () => {
    const service = serviceWith({
      findById: async () => null,
      updateById: async () => null,
      softDeleteById: async () => null,
      restoreById: async () => null,
    });

    expect(service.getOrderById(ORDER.id)).rejects.toThrow(NotFoundError);
    expect(service.updateOrder(ORDER.id, { note: 'x' })).rejects.toThrow(NotFoundError);
    expect(service.deleteOrder(ORDER.id)).rejects.toThrow(NotFoundError);
    expect(service.restoreOrder(ORDER.id)).rejects.toThrow(NotFoundError);
  });

  it('lists, adds, updates, deletes and syncs items through the header', async () => {
    const calls: string[] = [];
    const service = serviceWith(
      {},
      {
        findAllForParent: async (headerId) => {
          calls.push(`list:${headerId}`);
          return [ITEM];
        },
        createForParent: async (headerId) => {
          calls.push(`add:${headerId}`);
          return ITEM;
        },
        updateForParent: async (headerId, itemId) => {
          calls.push(`update:${headerId}:${itemId}`);
          return { ...ITEM, quantity: 5 };
        },
        deleteForParent: async (headerId, itemId) => {
          calls.push(`delete:${headerId}:${itemId}`);
          return true;
        },
        syncForParent: async (headerId, items) => {
          calls.push(`sync:${headerId}:${String(items.length)}`);
          return [ITEM];
        },
      },
    );

    expect(await service.listItems(ORDER.id)).toEqual([ITEM]);
    expect(await service.addItem(ORDER.id, { description: 'Widget', quantity: 2 })).toEqual(ITEM);
    expect((await service.updateItem(ORDER.id, ITEM.id, { quantity: 5 })).quantity).toBe(5);
    await service.deleteItem(ORDER.id, ITEM.id);
    expect(
      await service.syncItems(ORDER.id, {
        items: [{ id: ITEM.id, description: 'W', quantity: 1 }],
      }),
    ).toEqual([ITEM]);
    expect(calls).toEqual([
      `list:${ORDER.id}`,
      `add:${ORDER.id}`,
      `update:${ORDER.id}:${ITEM.id}`,
      `delete:${ORDER.id}:${ITEM.id}`,
      `sync:${ORDER.id}:1`,
    ]);
  });

  it('maps an item missing under the header to NotFoundError', () => {
    const service = serviceWith(
      {},
      { updateForParent: async () => null, deleteForParent: async () => false },
    );

    expect(service.updateItem(ORDER.id, ITEM.id, { quantity: 1 })).rejects.toThrow(NotFoundError);
    expect(service.deleteItem(ORDER.id, ITEM.id)).rejects.toThrow(NotFoundError);
  });
});
