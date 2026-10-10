import { z } from 'zod';
import { isoInstant } from '../../core/openapi';

export const createOrderSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  note: z.string().max(255).optional(),
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = z
  .object({
    code: z.string().min(1, 'Code is required').max(50),
    note: z.string().max(255).nullable(),
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type UpdateOrderDto = z.infer<typeof updateOrderSchema>;

const orderItemFields = z.object({
  description: z.string().min(1, 'Description is required').max(255),
  quantity: z.number().int().positive(),
});

export const createOrderItemSchema = orderItemFields;

export type CreateOrderItemDto = z.infer<typeof createOrderItemSchema>;

export const updateOrderItemSchema = orderItemFields
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type UpdateOrderItemDto = z.infer<typeof updateOrderItemSchema>;

export const syncOrderItemsSchema = z.object({
  items: z.array(orderItemFields.extend({ id: z.string().uuid().optional() })).max(500),
});

export type SyncOrderItemsDto = z.infer<typeof syncOrderItemsSchema>;

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  note: z.string().nullable(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const orderItemResponseSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  quantity: z.number().int(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type OrderItemResponse = z.infer<typeof orderItemResponseSchema>;
