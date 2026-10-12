import { z } from 'zod';

/** `:id` route param holding a UUID; a malformed id is a 400, never a database error. */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export type UuidParamDto = z.infer<typeof uuidParamSchema>;

/** `/:id/<details>/:childId` — a detail addressed through its header (both UUIDs). */
export const uuidChildParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
  childId: z.string().uuid('Invalid UUID format'),
});

export type UuidChildParamDto = z.infer<typeof uuidChildParamSchema>;

/**
 * An email as sent by a client, normalized before validation: trimmed and lower-cased, so
 * `Ada@Example.com` and `ada@example.com` are one account (the unique index compares bytes).
 * Use it for every request field holding an email.
 */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address format')
  .max(255);

/** Upper bound for passwords: hashing is deliberately slow, so huge inputs would be a DoS lever. */
export const MAX_PASSWORD_LENGTH = 1024;

/** A new password (create, register, change, reset); login accepts any non-empty password. */
export const newPasswordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(MAX_PASSWORD_LENGTH);

export const MAX_PER_PAGE = 100;

/** `?page=&per_page=` (snake_case on the wire, camelCase after `validate()`). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(10),
});

export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;
