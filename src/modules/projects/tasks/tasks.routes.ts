import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../../core/dto/common.dto';
import { validate } from '../../../core/middlewares';
import { describeEndpoint } from '../../../core/openapi';
import { tasksController } from './tasks.controller';
import { TASK_MESSAGES } from './tasks.messages';
import {
  createTaskSchema,
  taskParentParamSchema,
  taskResponseSchema,
  updateTaskSchema,
} from './tasks.dto';

const tags = ['Tasks'];

/** Mounted on `/projects/:projectId/tasks`: the project's tasks. */
const parentRouter = new Hono();

parentRouter.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Add a task to a project',
    response: {
      status: 201,
      description: 'Created',
      message: TASK_MESSAGES.CREATED,
      data: taskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: taskParentParamSchema, body: createTaskSchema }),
  tasksController.create,
);
parentRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: "List a project's tasks (paginated)",
    response: {
      status: 200,
      description: 'A page',
      message: TASK_MESSAGES.LIST_RETRIEVED,
      paginatedItem: taskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: taskParentParamSchema, query: paginationQuerySchema }),
  tasksController.list,
);

/** Mounted on `/tasks`: one task by its own id. */
const router = new Hono();

router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a task by id',
    response: {
      status: 200,
      description: 'Found',
      message: TASK_MESSAGES.RETRIEVED,
      data: taskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  tasksController.getById,
);
router.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a task (only the given fields)',
    response: {
      status: 200,
      description: 'Updated',
      message: TASK_MESSAGES.UPDATED,
      data: taskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema, body: updateTaskSchema }),
  tasksController.update,
);
router.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a task (soft delete; restorable)',
    response: {
      status: 200,
      description: 'Deleted',
      message: TASK_MESSAGES.DELETED,
      data: z.null(),
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  tasksController.remove,
);
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted task',
    response: {
      status: 200,
      description: 'Restored',
      message: TASK_MESSAGES.RESTORED,
      data: taskResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  tasksController.restore,
);

export { parentRouter as tasksParentRouter, router as tasksRouter };
