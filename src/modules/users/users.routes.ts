import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
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
    response: { status: 201, description: 'User created', data: userResponseSchema },
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
    response: { status: 200, description: 'A page of users', paginatedItem: userResponseSchema },
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
    response: { status: 200, description: 'The user', data: userResponseSchema },
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
    response: { status: 200, description: 'The updated user', data: userResponseSchema },
    errors: [404, 409],
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
    response: { status: 200, description: 'User deleted', data: z.null() },
    errors: [404],
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
    response: { status: 200, description: 'Password changed', data: z.null() },
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
    response: { status: 200, description: 'The restored user', data: userResponseSchema },
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
    response: { status: 200, description: 'External posts', data: z.array(externalPostSchema) },
    errors: [502, 504],
  }),
  selfOrAdmin,
  validate({ params: uuidParamSchema }),
  usersController.getExternalPosts,
);
