import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { usersController } from './users.controller';
import { createUserSchema, externalPostSchema, userResponseSchema } from './users.dto';

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
