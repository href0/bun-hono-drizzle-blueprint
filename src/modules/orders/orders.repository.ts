import {
  BaseRepository,
  ChildRepository,
  defaultTxHost,
  type TransactionHost,
} from '../../database';
import { orderItems, orders } from '../../database/schema';

export class OrdersRepository extends BaseRepository<typeof orders> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(orders, txHost);
  }
}

export class OrderItemsRepository extends ChildRepository<typeof orderItems, typeof orders> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(orderItems, orders, orderItems.orderId, txHost);
  }
}

export const ordersRepository = new OrdersRepository();
export const orderItemsRepository = new OrderItemsRepository();
