import { Hono } from 'hono';
import { validate } from '../../core/middlewares';
import { usersController } from './users.controller';
import { createUserSchema, userQuerySchema, userIdParamSchema } from './users.dto';

export const userRoutes = new Hono();

userRoutes.post('/', validate({ body: createUserSchema }), usersController.create);
userRoutes.get('/', validate({ query: userQuerySchema }), usersController.list);
userRoutes.get('/:id', validate({ params: userIdParamSchema }), usersController.getById);
userRoutes.get(
  '/:id/external-posts',
  validate({ params: userIdParamSchema }),
  usersController.getExternalPosts,
);
