import {
  ordersRepository,
  orderItemsRepository,
  OrdersRepository,
  OrderItemsRepository,
} from './orders.repository';
import { NotFoundError } from '../../core/errors';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type {
  CreateOrderDto,
  CreateOrderItemDto,
  SyncOrderItemsDto,
  UpdateOrderDto,
  UpdateOrderItemDto,
} from './orders.dto';
import { orderItemNotFoundMessage, orderNotFoundMessage } from './orders.messages';
import type { Order, OrderItem } from '../../database/schema';

export class OrdersService {
  constructor(
    private readonly headers: OrdersRepository = ordersRepository,
    private readonly items: OrderItemsRepository = orderItemsRepository,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    return this.headers.create({ ...dto });
  }

  async getOrderById(id: string): Promise<Order> {
    const record = await this.headers.findById(id);
    if (!record) throw new NotFoundError(orderNotFoundMessage(id));
    return record;
  }

  async listOrders(query: PaginationQueryDto): Promise<{ records: Order[]; total: number }> {
    const [records, total] = await Promise.all([
      this.headers.findPage({ page: query.page, perPage: query.perPage }),
      this.headers.count(),
    ]);
    return { records, total };
  }

  async updateOrder(id: string, dto: UpdateOrderDto): Promise<Order> {
    const updated = await this.headers.updateById(id, dto);
    if (!updated) throw new NotFoundError(orderNotFoundMessage(id));
    return updated;
  }

  /** Soft delete; the items stay (restorable with the header). */
  async deleteOrder(id: string): Promise<void> {
    const deleted = await this.headers.softDeleteById(id);
    if (!deleted) throw new NotFoundError(orderNotFoundMessage(id));
  }

  async restoreOrder(id: string): Promise<Order> {
    const restored = await this.headers.restoreById(id);
    if (!restored) throw new NotFoundError(orderNotFoundMessage(id));
    return restored;
  }

  async listItems(headerId: string): Promise<OrderItem[]> {
    return this.items.findAllForParent(headerId);
  }

  async addItem(headerId: string, dto: CreateOrderItemDto): Promise<OrderItem> {
    return this.items.createForParent(headerId, dto);
  }

  async updateItem(headerId: string, itemId: string, dto: UpdateOrderItemDto): Promise<OrderItem> {
    const updated = await this.items.updateForParent(headerId, itemId, dto);
    if (!updated) throw new NotFoundError(orderItemNotFoundMessage(itemId));
    return updated;
  }

  async deleteItem(headerId: string, itemId: string): Promise<void> {
    const deleted = await this.items.deleteForParent(headerId, itemId);
    if (!deleted) throw new NotFoundError(orderItemNotFoundMessage(itemId));
  }

  async syncItems(headerId: string, dto: SyncOrderItemsDto): Promise<OrderItem[]> {
    return this.items.syncForParent(headerId, dto.items);
  }
}

export const ordersService = new OrdersService();
