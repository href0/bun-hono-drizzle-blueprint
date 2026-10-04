import { z } from 'zod';
import { isoDateTime } from '../../core/openapi';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address format'),
  fullName: z.string().min(1, 'Full name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

/** Response shape (camelCase here; snake_case on the wire). The transformer's return type. */
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  isActive: z.boolean(),
  createdAt: isoDateTime(),
  updatedAt: isoDateTime(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

/** A post from the external JSONPlaceholder integration, as exposed by this API. */
export const externalPostSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  title: z.string(),
  body: z.string(),
});
