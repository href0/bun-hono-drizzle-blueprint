import { Hono } from 'hono';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { usersController } from './users.controller';
import { createUserSchema } from './users.dto';

export const userRoutes = new Hono();

userRoutes.post('/', validate({ body: createUserSchema }), usersController.create);
userRoutes.get('/', validate({ query: paginationQuerySchema }), usersController.list);
userRoutes.get('/:id', validate({ params: uuidParamSchema }), usersController.getById);
userRoutes.get(
  '/:id/external-posts',
  validate({ params: uuidParamSchema }),
  usersController.getExternalPosts,
);
