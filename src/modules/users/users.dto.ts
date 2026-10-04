import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address format'),
  fullName: z.string().min(1, 'Full name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

export const userQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID UUID format'),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UserQueryDto = z.infer<typeof userQuerySchema>;
export type UserIdParamDto = z.infer<typeof userIdParamSchema>;
