import { z } from 'zod';
import { isoInstant } from '../../core/openapi';
import type { User } from '../../database/schema';

/** A user without secrets — what the detail cache holds and what getUserById returns. */
export type PublicUser = Omit<User, 'passwordHash'>;

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address format'),
  fullName: z.string().min(1, 'Full name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

/** Partial update: only the given fields change (password changes get their own flow in phase 3). */
export const updateUserSchema = z
  .object({
    email: z.string().email('Invalid email address format'),
    fullName: z.string().min(1, 'Full name is required').max(255),
    isActive: z.boolean(),
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;

/** Response shape (camelCase here; snake_case on the wire). The transformer's return type. */
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  isActive: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

/** A post from the external JSONPlaceholder integration, as exposed by this API. */
export const externalPostSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  title: z.string(),
  body: z.string(),
});
