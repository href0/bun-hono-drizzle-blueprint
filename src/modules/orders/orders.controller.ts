import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { ordersService, OrdersService } from './orders.service';
import {
  toOrderItemListResponse,
  toOrderItemResponse,
  toOrderListResponse,
  toOrderResponse,
} from './orders.transformer';
import type {
  PaginationQueryDto,
  UuidChildParamDto,
  UuidParamDto,
} from '../../core/dto/common.dto';
import type {
  CreateOrderDto,
  CreateOrderItemDto,
  SyncOrderItemsDto,
  UpdateOrderDto,
  UpdateOrderItemDto,
} from './orders.dto';
import { ORDER_MESSAGES } from './orders.messages';

export class OrdersController {
  constructor(private readonly service: OrdersService = ordersService) {}

  create = asyncHandler(async (c) => {
    const created = await this.service.createOrder(getValidatedBody<CreateOrderDto>(c));
    return new ApiResponse(toOrderResponse(created), ORDER_MESSAGES.CREATED, 201);
  });

  getById = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const record = await this.service.getOrderById(id);
    return new ApiResponse(toOrderResponse(record), ORDER_MESSAGES.RETRIEVED, 200);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { records, total } = await this.service.listOrders(query);
    return new ApiResponse(toOrderListResponse(records), ORDER_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages: Math.ceil(total / query.perPage) || 1,
    });
  });

  update = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const updated = await this.service.updateOrder(id, getValidatedBody<UpdateOrderDto>(c));
    return new ApiResponse(toOrderResponse(updated), ORDER_MESSAGES.UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteOrder(id);
    return new ApiResponse(null, ORDER_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const restored = await this.service.restoreOrder(id);
    return new ApiResponse(toOrderResponse(restored), ORDER_MESSAGES.RESTORED, 200);
  });

  listItems = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const items = await this.service.listItems(id);
    return new ApiResponse(toOrderItemListResponse(items), ORDER_MESSAGES.ITEMS_RETRIEVED, 200);
  });

  addItem = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const item = await this.service.addItem(id, getValidatedBody<CreateOrderItemDto>(c));
    return new ApiResponse(toOrderItemResponse(item), ORDER_MESSAGES.ITEM_CREATED, 201);
  });

  updateItem = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    const item = await this.service.updateItem(
      id,
      childId,
      getValidatedBody<UpdateOrderItemDto>(c),
    );
    return new ApiResponse(toOrderItemResponse(item), ORDER_MESSAGES.ITEM_UPDATED, 200);
  });

  deleteItem = asyncHandler(async (c) => {
    const { id, childId } = getValidatedParams<UuidChildParamDto>(c);
    await this.service.deleteItem(id, childId);
    return new ApiResponse(null, ORDER_MESSAGES.ITEM_DELETED, 200);
  });

  syncItems = asyncHandler(async (c) => {
    const { id } = getValidatedParams<UuidParamDto>(c);
    const items = await this.service.syncItems(id, getValidatedBody<SyncOrderItemsDto>(c));
    return new ApiResponse(toOrderItemListResponse(items), ORDER_MESSAGES.ITEMS_SAVED, 200);
  });
}

export const ordersController = new OrdersController();
