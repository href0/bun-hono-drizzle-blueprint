import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../../core/dto/common.dto';
import { validate } from '../../../core/middlewares';
import { describeEndpoint } from '../../../core/openapi';
import { projectTasksController } from './project-tasks.controller';
import { PROJECT_TASK_MESSAGES } from './project-tasks.messages';
import {
  createProjectTaskSchema,
  projectTaskListQuerySchema,
  projectTaskParentParamSchema,
  projectTaskResponseSchema,
  updateProjectTaskSchema,
} from './project-tasks.dto';

const tags = ['ProjectTasks'];

/** Mounted on `/projects/:projectId/tasks`: the project's projectTasks. */
const parentRouter = new Hono();

parentRouter.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Add a projectTask to a project',
    response: {
      status: 201,
      description: 'Created',
      message: PROJECT_TASK_MESSAGES.CREATED,
      data: projectTaskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: projectTaskParentParamSchema, body: createProjectTaskSchema }),
  projectTasksController.create,
);
parentRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: "List a project's projectTasks (paginated, sortable, searchable)",
    response: {
      status: 200,
      description: 'A page',
      message: PROJECT_TASK_MESSAGES.LIST_RETRIEVED,
      paginatedItem: projectTaskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: projectTaskParentParamSchema, query: projectTaskListQuerySchema }),
  projectTasksController.list,
);

/** Mounted on `/project-tasks`: one projectTask by its own id. */
const router = new Hono();

router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a projectTask by id',
    response: {
      status: 200,
      description: 'Found',
      message: PROJECT_TASK_MESSAGES.RETRIEVED,
      data: projectTaskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectTasksController.getById,
);
router.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a projectTask (only the given fields)',
    response: {
      status: 200,
      description: 'Updated',
      message: PROJECT_TASK_MESSAGES.UPDATED,
      data: projectTaskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema, body: updateProjectTaskSchema }),
  projectTasksController.update,
);
router.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a projectTask (soft delete; restorable)',
    response: {
      status: 200,
      description: 'Deleted',
      message: PROJECT_TASK_MESSAGES.DELETED,
      data: z.null(),
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectTasksController.remove,
);
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted projectTask',
    response: {
      status: 200,
      description: 'Restored',
      message: PROJECT_TASK_MESSAGES.RESTORED,
      data: projectTaskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectTasksController.restore,
);

export { parentRouter as projectTasksParentRouter, router as projectTasksRouter };
