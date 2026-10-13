import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { projectsController } from './projects.controller';
import { createProjectSchema, updateProjectSchema, projectResponseSchema } from './projects.dto';

const router = new Hono();
const tags = ['Projects'];

router.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a project',
    response: { status: 201, description: 'Created', data: projectResponseSchema },
  }),
  validate({ body: createProjectSchema }),
  projectsController.create,
);
router.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List projects (paginated)',
    response: { status: 200, description: 'A page', paginatedItem: projectResponseSchema },
  }),
  validate({ query: paginationQuerySchema }),
  projectsController.list,
);
router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a project by id',
    response: { status: 200, description: 'Found', data: projectResponseSchema },
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
    response: { status: 200, description: 'Updated', data: projectResponseSchema },
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
    response: { status: 200, description: 'Deleted', data: z.null() },
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
    response: { status: 200, description: 'Restored', data: projectResponseSchema },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectsController.restore,
);

export { router as projectsRouter };
