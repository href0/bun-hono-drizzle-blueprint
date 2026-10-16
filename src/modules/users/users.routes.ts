import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
import { APP_ERROR_CODES } from '../../core/errors';
import { requireRole, requireSelfOrRole, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { usersController } from './users.controller';
import {
  createUserSchema,
  externalPostSchema,
  setPasswordSchema,
  updateUserSchema,
  userResponseSchema,
} from './users.dto';
import { USER_MESSAGES } from './users.messages';

export const userRoutes = new Hono();

const tags = ['Users'];

/** User management is for admins; a user may read their own record (`/users/:id`, own id). */
const adminOnly = requireRole('admin');
const selfOrAdmin = requireSelfOrRole('id', 'admin');

userRoutes.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a user',
    response: {
      status: 201,
      description: 'User created',
      message: USER_MESSAGES.CREATED,
      data: userResponseSchema,
    },
    errors: [409],
  }),
  adminOnly,
  validate({ body: createUserSchema }),
  usersController.create,
);
userRoutes.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List users (paginated)',
    response: {
      status: 200,
      description: 'A page of users',
      message: USER_MESSAGES.LIST_RETRIEVED,
      paginatedItem: userResponseSchema,
    },
  }),
  adminOnly,
  validate({ query: paginationQuerySchema }),
  usersController.list,
);
userRoutes.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a user by id',
    response: {
      status: 200,
      description: 'The user',
      message: USER_MESSAGES.RETRIEVED,
      data: userResponseSchema,
    },
    errors: [404],
  }),
  selfOrAdmin,
  validate({ params: uuidParamSchema }),
  usersController.getById,
);
userRoutes.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a user (only the given fields)',
    response: {
      status: 200,
      description: 'The updated user',
      message: USER_MESSAGES.UPDATED,
      data: userResponseSchema,
    },
    errors: [404, 409, { status: 403, codes: [APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN] }],
  }),
  adminOnly,
  validate({ params: uuidParamSchema, body: updateUserSchema }),
  usersController.update,
);
userRoutes.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a user (soft delete; restorable)',
    response: {
      status: 200,
      description: 'User deleted',
      message: USER_MESSAGES.DELETED,
      data: z.null(),
    },
    errors: [404, { status: 403, codes: [APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN] }],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  usersController.remove,
);
userRoutes.put(
  '/:id/password',
  describeEndpoint({
    tags,
    summary: "Reset a user's password (ends all of their sessions)",
    response: {
      status: 200,
      description: 'Password changed',
      message: USER_MESSAGES.PASSWORD_SET,
      data: z.null(),
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema, body: setPasswordSchema }),
  usersController.setPassword,
);
userRoutes.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted user',
    response: {
      status: 200,
      description: 'The restored user',
      message: USER_MESSAGES.RESTORED,
      data: userResponseSchema,
    },
    errors: [404, 409],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  usersController.restore,
);
userRoutes.get(
  '/:id/external-posts',
  describeEndpoint({
    tags,
    summary: "List the user's posts from the external JSONPlaceholder service",
    response: {
      status: 200,
      description: 'External posts',
      message: USER_MESSAGES.EXTERNAL_POSTS_RETRIEVED,
      data: z.array(externalPostSchema),
    },
    errors: [404, 502, 504],
  }),
  selfOrAdmin,
  validate({ params: uuidParamSchema }),
  usersController.getExternalPosts,
);
