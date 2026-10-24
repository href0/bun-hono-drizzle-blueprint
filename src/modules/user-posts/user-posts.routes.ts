import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../core/dto/common.dto';
import { requireSelfOrRole, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { userPostsController } from './user-posts.controller';
import { externalPostSchema } from './user-posts.dto';
import { USER_POST_MESSAGES } from './user-posts.messages';

/** Mounted at `/users` next to the users module: `/users/:id/external-posts`, own id or admin. */
export const userPostRoutes = new Hono();

userPostRoutes.get(
  '/:id/external-posts',
  describeEndpoint({
    tags: ['Users'],
    summary: "List the user's posts from the external JSONPlaceholder service (example)",
    response: {
      status: 200,
      description: 'External posts',
      message: USER_POST_MESSAGES.EXTERNAL_POSTS_RETRIEVED,
      data: z.array(externalPostSchema),
    },
    errors: [502, 504],
  }),
  requireSelfOrRole('id', 'admin'),
  validate({ params: uuidParamSchema }),
  userPostsController.list,
);
