import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { usersController } from './users.controller';
import {
  createUserSchema,
  externalPostSchema,
  updateUserSchema,
  userResponseSchema,
} from './users.dto';

export const userRoutes = new Hono();

const tags = ['Users'];

userRoutes.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a user',
    response: { status: 201, description: 'User created', data: userResponseSchema },
    errors: [409],
  }),
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
  validate({ params: uuidParamSchema }),
  usersController.remove,
);
userRoutes.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted user',
    response: { status: 200, description: 'The restored user', data: userResponseSchema },
    errors: [404, 409],
  }),
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
  validate({ params: uuidParamSchema }),
  usersController.getExternalPosts,
);
