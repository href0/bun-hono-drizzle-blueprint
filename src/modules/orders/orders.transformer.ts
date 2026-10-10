import type { Order, OrderItem } from '../../database/schema';
import type { OrderItemResponse, OrderResponse } from './orders.dto';

export const toOrderResponse = (entity: Order): OrderResponse => ({
  id: entity.id,
  code: entity.code,
  note: entity.note,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const toOrderListResponse = (entities: Order[]): OrderResponse[] =>
  entities.map(toOrderResponse);

export const toOrderItemResponse = (item: OrderItem): OrderItemResponse => ({
  id: item.id,
  description: item.description,
  quantity: item.quantity,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

export const toOrderItemListResponse = (items: OrderItem[]): OrderItemResponse[] =>
  items.map(toOrderItemResponse);
