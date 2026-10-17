import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../../core/dto/common.dto';
import { validate } from '../../../core/middlewares';
import { describeEndpoint } from '../../../core/openapi';
import { projectBudgetsController } from './project-budgets.controller';
import { PROJECT_BUDGET_MESSAGES } from './project-budgets.messages';
import {
  projectBudgetParentParamSchema,
  projectBudgetResponseSchema,
  saveProjectBudgetSchema,
} from './project-budgets.dto';

const tags = ['ProjectBudgets'];

/** Mounted on `/projects/:projectId/budget`: the project's projectBudget. */
const parentRouter = new Hono();

parentRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: "Get a project's projectBudget",
    response: {
      status: 200,
      description: 'Found',
      message: PROJECT_BUDGET_MESSAGES.RETRIEVED,
      data: projectBudgetResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: projectBudgetParentParamSchema }),
  projectBudgetsController.getForParent,
);
parentRouter.put(
  '/',
  describeEndpoint({
    tags,
    summary: "Save a project's projectBudget (201 created, 200 updated)",
    response: {
      status: 201,
      description: 'Created',
      message: PROJECT_BUDGET_MESSAGES.CREATED,
      data: projectBudgetResponseSchema,
    },
    alsoResponds: [
      { status: 200, description: 'Updated', message: PROJECT_BUDGET_MESSAGES.UPDATED },
    ],
    errors: [404],
  }),
  validate({ params: projectBudgetParentParamSchema, body: saveProjectBudgetSchema }),
  projectBudgetsController.save,
);
parentRouter.delete(
  '/',
  describeEndpoint({
    tags,
    summary: "Delete a project's projectBudget (soft delete; restorable)",
    response: {
      status: 200,
      description: 'Deleted',
      message: PROJECT_BUDGET_MESSAGES.DELETED,
      data: z.null(),
    },
    errors: [404],
  }),
  validate({ params: projectBudgetParentParamSchema }),
  projectBudgetsController.removeForParent,
);

/** Mounted on `/project-budgets`: one projectBudget by its own id. */
const router = new Hono();

router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a projectBudget by id',
    response: {
      status: 200,
      description: 'Found',
      message: PROJECT_BUDGET_MESSAGES.RETRIEVED,
      data: projectBudgetResponseSchema,
    },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  projectBudgetsController.getById,
);
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted projectBudget (409 while another one is live)',
    response: {
      status: 200,
      description: 'Restored',
      message: PROJECT_BUDGET_MESSAGES.RESTORED,
      data: projectBudgetResponseSchema,
    },
    errors: [404, 409],
  }),
  validate({ params: uuidParamSchema }),
  projectBudgetsController.restore,
);

export { parentRouter as projectBudgetsParentRouter, router as projectBudgetsRouter };
