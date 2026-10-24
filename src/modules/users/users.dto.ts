import { z } from 'zod';
import { emailField, newPasswordField } from '../../core/dto/common.dto';
import { isoInstant } from '../../core/openapi';
import { ROLES } from '../../core/security/roles';
import type { User } from '../../database/schema';

/** A user without password data — what the detail cache holds and what getUserById returns. */
export type PublicUser = Omit<User, 'passwordHash' | 'passwordChangedAt'>;

export const createUserSchema = z.object({
  email: emailField,
  fullName: z.string().min(1, 'Full name is required').max(255),
  password: newPasswordField,
  /** Default `user` (the column default); only admins reach this endpoint. */
  role: z.enum(ROLES).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

/** Partial update: only the given fields change (the password has its own endpoint). */
export const updateUserSchema = z
  .object({
    email: emailField,
    fullName: z.string().min(1, 'Full name is required').max(255),
    role: z.enum(ROLES),
    isActive: z.boolean(),
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;

/** Admin reset: the user's sessions end (refresh is refused for older token families). */
export const setPasswordSchema = z.object({ password: newPasswordField });

export type SetPasswordDto = z.infer<typeof setPasswordSchema>;

/** Response shape (camelCase here; snake_case on the wire). The transformer's return type. */
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  /** One of ROLES (stored as varchar; validated on the way in). */
  role: z.string(),
  isActive: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
