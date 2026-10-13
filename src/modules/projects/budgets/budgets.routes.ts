import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../../core/dto/common.dto';
import { validate } from '../../../core/middlewares';
import { describeEndpoint } from '../../../core/openapi';
import { budgetsController } from './budgets.controller';
import { budgetParentParamSchema, budgetResponseSchema, saveBudgetSchema } from './budgets.dto';

const tags = ['Budgets'];

/** Mounted on `/projects/:projectId/budget`: the project's budget. */
const parentRouter = new Hono();

parentRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: "Get a project's budget",
    response: { status: 200, description: 'Found', data: budgetResponseSchema },
    errors: [404],
  }),
  validate({ params: budgetParentParamSchema }),
  budgetsController.getForParent,
);
parentRouter.put(
  '/',
  describeEndpoint({
    tags,
    summary: "Save a project's budget (201 created, 200 updated)",
    response: { status: 200, description: 'Saved', data: budgetResponseSchema },
    errors: [404],
  }),
  validate({ params: budgetParentParamSchema, body: saveBudgetSchema }),
  budgetsController.save,
);
parentRouter.delete(
  '/',
  describeEndpoint({
    tags,
    summary: "Delete a project's budget (soft delete; restorable)",
    response: { status: 200, description: 'Deleted', data: z.null() },
    errors: [404],
  }),
  validate({ params: budgetParentParamSchema }),
  budgetsController.removeForParent,
);

/** Mounted on `/budgets`: one budget by its own id. */
const router = new Hono();

router.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a budget by id',
    response: { status: 200, description: 'Found', data: budgetResponseSchema },
    errors: [404],
  }),
  validate({ params: uuidParamSchema }),
  budgetsController.getById,
);
router.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted budget (409 while another one is live)',
    response: { status: 200, description: 'Restored', data: budgetResponseSchema },
    errors: [404, 409],
  }),
  validate({ params: uuidParamSchema }),
  budgetsController.restore,
);

export { parentRouter as budgetsParentRouter, router as budgetsRouter };
