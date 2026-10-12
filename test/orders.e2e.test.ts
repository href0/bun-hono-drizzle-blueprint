/**
 * Example module (header + detail) — HTTP contract through createApp(). The service is stubbed with
 * spyOn (never mock.module()); repository behaviour is covered in src/database/*.test.ts and against
 * PostgreSQL in the integration suite. Removed with the module by `bun run setup <name>`.
 */
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import type { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { createApp } from '../src/app';
import { authorize } from './helpers/authorized-app';
import { NotFoundError } from '../src/core/errors';
import { ordersService } from '../src/modules/orders/orders.service';
import type { Order, OrderItem } from '../src/database/schema';

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
const OTHER = '0192f1d0-0000-7000-8000-0000000000ff';

const ensureOrder = (id: string): void => {
  if (id !== ORDER.id) throw new NotFoundError();
};

describe('Orders (example header + detail) — E2E contract', () => {
  let app: Hono;
  const spies: ReturnType<typeof spyOn>[] = [];

  beforeAll(async () => {
    spies.push(
      spyOn(ordersService, 'createOrder').mockImplementation(async () => ORDER),
      spyOn(ordersService, 'listOrders').mockImplementation(async () => ({
        records: [ORDER],
        total: 1,
      })),
      spyOn(ordersService, 'getOrderById').mockImplementation(async (id) => {
        ensureOrder(id);
        return ORDER;
      }),
      spyOn(ordersService, 'updateOrder').mockImplementation(async (id, dto) => {
        ensureOrder(id);
        return { ...ORDER, ...dto };
      }),
      spyOn(ordersService, 'deleteOrder').mockImplementation(async (id) => {
        ensureOrder(id);
      }),
      spyOn(ordersService, 'restoreOrder').mockImplementation(async (id) => {
        ensureOrder(id);
        return ORDER;
      }),
      spyOn(ordersService, 'listItems').mockImplementation(async (id) => {
        ensureOrder(id);
        return [ITEM];
      }),
      spyOn(ordersService, 'addItem').mockImplementation(async (id, dto) => {
        ensureOrder(id);
        return { ...ITEM, ...dto };
      }),
      spyOn(ordersService, 'updateItem').mockImplementation(async (id, itemId, dto) => {
        ensureOrder(id);
        if (itemId !== ITEM.id) throw new NotFoundError();
        return { ...ITEM, ...dto };
      }),
      spyOn(ordersService, 'deleteItem').mockImplementation(async (id, itemId) => {
        ensureOrder(id);
        if (itemId !== ITEM.id) throw new NotFoundError();
      }),
      spyOn(ordersService, 'syncItems').mockImplementation(async (id, dto) => {
        ensureOrder(id);
        return dto.items.map((item, index) => ({
          ...ITEM,
          ...item,
          id: item.id ?? `new-${String(index)}`,
        }));
      }),
    );
    app = await authorize(createApp());
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  const call = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{
    status: number;
    body: { data?: unknown; meta?: unknown; error?: { code: string } };
  }> => {
    const res = await app.request(`/api/v1/orders${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as never };
  };

  it('header: create, list, get, update, delete, restore', async () => {
    expect((await call('POST', '', { code: 'ORD-1' })).status).toBe(201);
    const list = await call('GET', '?page=1&per_page=10');
    expect(list.status).toBe(200);
    expect(list.body.meta).toEqual({
      current_page: 1,
      per_page: 10,
      total_items: 1,
      total_pages: 1,
    });
    expect((await call('GET', `/${ORDER.id}`)).body.data).toMatchObject({ code: 'ORD-1' });
    expect((await call('PATCH', `/${ORDER.id}`, { note: 'rush' })).body.data).toMatchObject({
      note: 'rush',
    });
    expect((await call('DELETE', `/${ORDER.id}`)).body.data).toBeNull();
    expect((await call('POST', `/${ORDER.id}/restore`)).status).toBe(200);
  });

  it('items: list, add, update, delete — all through the header', async () => {
    expect((await call('GET', `/${ORDER.id}/items`)).body.data).toHaveLength(1);
    const added = await call('POST', `/${ORDER.id}/items`, { description: 'Gadget', quantity: 3 });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ description: 'Gadget', quantity: 3 });
    expect(
      (await call('PATCH', `/${ORDER.id}/items/${ITEM.id}`, { quantity: 9 })).body.data,
    ).toMatchObject({ quantity: 9 });
    expect((await call('DELETE', `/${ORDER.id}/items/${ITEM.id}`)).body.data).toBeNull();
  });

  it('items: PUT saves the whole list (snake_case nested keys)', async () => {
    const saved = await call('PUT', `/${ORDER.id}/items`, {
      items: [
        { id: ITEM.id, description: 'Widget', quantity: 4 },
        { description: 'New', quantity: 1 },
      ],
    });

    expect(saved.status).toBe(200);
    expect(saved.body.data).toHaveLength(2);
  });

  it('a missing header or an item of another header is 404', async () => {
    expect((await call('GET', `/${OTHER}/items`)).status).toBe(404);
    expect((await call('DELETE', `/${ORDER.id}/items/${OTHER}`)).status).toBe(404);
  });

  it('validation: bad ids, empty patch, bad quantity, camelCase keys → 400', async () => {
    expect((await call('GET', '/not-a-uuid')).status).toBe(400);
    expect((await call('DELETE', `/${ORDER.id}/items/not-a-uuid`)).status).toBe(400);
    expect((await call('PATCH', `/${ORDER.id}`, {})).status).toBe(400);
    expect(
      (await call('POST', `/${ORDER.id}/items`, { description: 'x', quantity: 0 })).status,
    ).toBe(400);
    const camel = await call('PUT', `/${ORDER.id}/items`, {
      items: [{ description: 'x', quantity: 1, itemCode: 'A' }],
    });
    expect(camel.body.error?.code).toBe('ERR_NON_SNAKE_CASE_KEY');
  });
});
