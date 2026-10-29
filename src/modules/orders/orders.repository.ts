import {
  BaseRepository,
  ChildRepository,
  defaultTxHost,
  instantRange,
  type ListColumns,
  type TransactionHost,
} from '../../database';
import { orderItems, orders, type Order } from '../../database/schema';
import type { OrderListQueryDto, OrderSortField } from './orders.dto';

/** The header list's allowlist (D41): sortable fields → columns, and the columns `q` searches. */
const ORDER_LIST_COLUMNS: ListColumns<OrderSortField> = {
  sort: {
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
    code: orders.code,
  },
  search: [orders.code, orders.note],
};

export class OrdersRepository extends BaseRepository<typeof orders> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(orders, txHost);
  }

  /** A page of live headers matching the list query, and the total under the same filters. */
  async findOrderList(query: OrderListQueryDto): Promise<{ rows: Order[]; total: number }> {
    return this.findList(
      query,
      ORDER_LIST_COLUMNS,
      instantRange(orders.createdAt, query.createdFrom, query.createdTo),
    );
  }
}

export class OrderItemsRepository extends ChildRepository<typeof orderItems, typeof orders> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(orderItems, orders, orderItems.orderId, txHost);
  }
}

export const ordersRepository = new OrdersRepository();
export const orderItemsRepository = new OrderItemsRepository();
