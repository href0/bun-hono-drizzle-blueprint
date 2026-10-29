import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { projectsController } from './projects.controller';
import { PROJECT_MESSAGES } from './projects.messages';
import {
  createProjectSchema,
  updateProjectSchema,
  projectListQuerySchema,
  projectResponseSchema,
} from './projects.dto';

const router = new Hono();
const tags = ['Projects'];

router.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a project',
    response: {
      status: 201,
      description: 'Created',
      message: PROJECT_MESSAGES.CREATED,
      data: projectResponseSchema,
    },
  }),
  validate({ body: createProjectSchema }),
  projectsController.create,
);
router.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List projects (paginated, sortable, searchable)',
    response: {
      status: 200,
      description: 'A page',
      message: PROJECT_MESSAGES.LIST_RETRIEVED,
      paginatedItem: projectResponseSchema,
    },
  }),
  validate({ query: projectListQuerySchema }),
  projectsController.list,
);
router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a project by id',
    response: {
      status: 200,
      description: 'Found',
      message: PROJECT_MESSAGES.RETRIEVED,
      data: projectResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectsController.getById,
);
router.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a project (only the given fields)',
    response: {
      status: 200,
      description: 'Updated',
      message: PROJECT_MESSAGES.UPDATED,
      data: projectResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema, body: updateProjectSchema }),
  projectsController.update,
);
router.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a project (soft delete; restorable)',
    response: {
      status: 200,
      description: 'Deleted',
      message: PROJECT_MESSAGES.DELETED,
      data: z.null(),
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectsController.remove,
);
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted project',
    response: {
      status: 200,
      description: 'Restored',
      message: PROJECT_MESSAGES.RESTORED,
      data: projectResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectsController.restore,
);

export { router as projectsRouter };
