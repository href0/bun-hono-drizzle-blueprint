import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import {
  toOrderItemListResponse,
  toOrderItemResponse,
  toOrderListResponse,
  toOrderResponse,
} from './orders.transformer';
import type { Order, OrderItem } from '../../database/schema';

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const ORDER: Order = {
  id: '0192f1d0-0000-7000-8000-000000000001',
  code: 'ORD-1',
  note: 'rush',
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'user:1',
  updatedBy: 'user:2',
  deletedAt: null,
};
const ITEM: OrderItem = {
  id: '0192f1d0-0000-7000-8000-00000000000a',
  orderId: ORDER.id,
  description: 'Widget',
  quantity: 2,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'user:1',
  updatedBy: 'user:1',
};

describe('orders transformer', () => {
  it('exposes the order without audit or soft-delete columns', () => {
    expect(toOrderResponse(ORDER)).toEqual({
      id: ORDER.id,
      code: 'ORD-1',
      note: 'rush',
      createdAt: AT,
      updatedAt: AT,
    });
    expect(toOrderListResponse([ORDER])).toHaveLength(1);
  });

  it('exposes an item without its header reference or audit columns', () => {
    expect(toOrderItemResponse(ITEM)).toEqual({
      id: ITEM.id,
      description: 'Widget',
      quantity: 2,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(toOrderItemListResponse([ITEM, ITEM])).toHaveLength(2);
  });
});
