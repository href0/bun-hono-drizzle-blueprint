import { Hono } from 'hono';
import { z } from 'zod';
import { uuidChildParamSchema, uuidParamSchema } from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { ordersController } from './orders.controller';
import { ORDER_MESSAGES } from './orders.messages';
import {
  createOrderItemSchema,
  createOrderSchema,
  orderItemResponseSchema,
  orderListQuerySchema,
  orderResponseSchema,
  syncOrderItemsSchema,
  updateOrderItemSchema,
  updateOrderSchema,
} from './orders.dto';

const router = new Hono();
const tags = ['Orders'];

router.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a order',
    response: {
      status: 201,
      description: 'Created',
      message: ORDER_MESSAGES.CREATED,
      data: orderResponseSchema,
    },
  }),
  validate({ body: createOrderSchema }),
  ordersController.create,
);
router.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List orders (paginated, sortable, searchable)',
    response: {
      status: 200,
      description: 'A page',
      message: ORDER_MESSAGES.LIST_RETRIEVED,
      paginatedItem: orderResponseSchema,
    },
  }),
  validate({ query: orderListQuerySchema }),
  ordersController.list,
);
router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a order by id',
    response: {
      status: 200,
      description: 'Found',
      message: ORDER_MESSAGES.RETRIEVED,
      data: orderResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  ordersController.getById,
);
router.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a order (only the given fields)',
    response: {
      status: 200,
      description: 'Updated',
      message: ORDER_MESSAGES.UPDATED,
      data: orderResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema, body: updateOrderSchema }),
  ordersController.update,
);
router.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a order (soft delete; restorable)',
    response: {
      status: 200,
      description: 'Deleted',
      message: ORDER_MESSAGES.DELETED,
      data: z.null(),
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  ordersController.remove,
);
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted order',
    response: {
      status: 200,
      description: 'Restored',
      message: ORDER_MESSAGES.RESTORED,
      data: orderResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  ordersController.restore,
);

router.get(
  '/:id/items',
  describeEndpoint({
    tags,
    summary: "List a order's items",
    response: {
      status: 200,
      description: 'Items, oldest first',
      message: ORDER_MESSAGES.ITEMS_RETRIEVED,
      data: z.array(orderItemResponseSchema),
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  ordersController.listItems,
);
router.post(
  '/:id/items',
  describeEndpoint({
    tags,
    summary: 'Add an item to a order',
    response: {
      status: 201,
      description: 'Item added',
      message: ORDER_MESSAGES.ITEM_CREATED,
      data: orderItemResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema, body: createOrderItemSchema }),
  ordersController.addItem,
);
router.put(
  '/:id/items',
  describeEndpoint({
    tags,
    summary: "Replace a order's item list (update kept ids, add new, delete missing)",
    response: {
      status: 200,
      description: 'The saved list',
      message: ORDER_MESSAGES.ITEMS_SAVED,
      data: z.array(orderItemResponseSchema),
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema, body: syncOrderItemsSchema }),
  ordersController.syncItems,
);
router.patch(
  '/:id/items/:childId',
  describeEndpoint({
    tags,
    summary: 'Update an item (only the given fields)',
    response: {
      status: 200,
      description: 'Item updated',
      message: ORDER_MESSAGES.ITEM_UPDATED,
      data: orderItemResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidChildParamSchema, body: updateOrderItemSchema }),
  ordersController.updateItem,
);
router.delete(
  '/:id/items/:childId',
  describeEndpoint({
    tags,
    summary: 'Delete an item',
    response: {
      status: 200,
      description: 'Item deleted',
      message: ORDER_MESSAGES.ITEM_DELETED,
      data: z.null(),
    },
    errors: [404],
  }),
  validate({ params: uuidChildParamSchema }),
  ordersController.deleteItem,
);

export { router as ordersRouter };
