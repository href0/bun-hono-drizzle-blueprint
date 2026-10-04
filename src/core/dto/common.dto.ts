import { z } from 'zod';

/** `:id` route param holding a UUID; a malformed id is a 400, never a database error. */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export type UuidParamDto = z.infer<typeof uuidParamSchema>;

export const MAX_PER_PAGE = 100;

/** `?page=&per_page=` (snake_case on the wire, camelCase after `validate()`). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(10),
});

export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;
