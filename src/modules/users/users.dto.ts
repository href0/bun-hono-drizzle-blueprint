import { z } from 'zod';
import { emailField, newPasswordField } from '../../core/dto/common.dto';
import {
  booleanQueryField,
  instantRangeQuery,
  listQuerySchema,
  searchQueryField,
  strictListQuery,
} from '../../core/dto/list-query.dto';
import { isoInstant } from '../../core/openapi';
import type { User } from '../../database/schema';

/** A user without password data — what the detail cache holds and what getUserById returns. */
export type PublicUser = Omit<User, 'passwordHash' | 'passwordChangedAt'>;

/** A user with the keys of their live roles — what the service returns (roles are read fresh, never cached). */
export type UserWithRoles = PublicUser & { roles: string[] };

export const createUserSchema = z.object({
  email: emailField,
  fullName: z.string().min(1, 'Full name is required').max(255),
  password: newPasswordField,
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

/** Partial update: only the given fields change (the password has its own endpoint). */
export const updateUserSchema = z
  .object({
    email: emailField,
    fullName: z.string().min(1, 'Full name is required').max(255),
    isActive: z.boolean(),
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;

/** Fields `GET /users` may sort by (D41); the repository maps each one to its column. */
export const USER_SORTABLE = ['createdAt', 'updatedAt', 'email', 'fullName'] as const;

export type UserSortField = (typeof USER_SORTABLE)[number];

/** `GET /users?sort=&q=&is_active=&created_from=&created_to=`; `q` searches email and name. */
export const userListQuerySchema = strictListQuery(
  listQuerySchema(USER_SORTABLE).extend({
    q: searchQueryField,
    isActive: booleanQueryField,
    ...instantRangeQuery('created'),
  }),
  { ranges: ['created'] },
);

export type UserListQueryDto = z.infer<typeof userListQuerySchema>;

/** Admin reset: the user's sessions end (refresh is refused for older token families). */
export const setPasswordSchema = z.object({ password: newPasswordField });

export type SetPasswordDto = z.infer<typeof setPasswordSchema>;

/** Response shape (camelCase here; snake_case on the wire). The transformer's return type. */
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  /** Keys of the user's live roles (`super_admin`, `user`, …), sorted; changed through the RBAC API. */
  roles: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
