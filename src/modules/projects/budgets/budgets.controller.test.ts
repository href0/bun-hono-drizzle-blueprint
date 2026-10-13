import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../../core/middlewares';
import type { Budget } from '../../../database/schema';
import { budgetMissingMessage, budgetNotFoundMessage } from './budgets.messages';
import { budgetsParentRouter, budgetsRouter } from './budgets.routes';
import { budgetsService } from './budgets.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';
const EMPTY_PARENT = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9c';

const record: Budget = {
  id: ID,
  projectId: PARENT_ID,
  name: 'Sample',
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const app = new Hono();
app.use('*', requestContextMiddleware());
app.route('/projects/:projectId/budget', budgetsParentRouter);
app.route('/budgets', budgetsRouter);
app.onError(globalErrorHandler);

const section = (parentId: string): string => `/projects/${parentId}/budget`;

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('BudgetsController (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];

  beforeAll(() => {
    spies.push(
      spyOn(budgetsService, 'getBudget').mockImplementation(async (parentId) => {
        if (parentId !== PARENT_ID) throw new NotFoundError(budgetMissingMessage(parentId));
        return record;
      }),
      spyOn(budgetsService, 'saveBudget').mockImplementation(async (parentId) => ({
        row: record,
        created: parentId === EMPTY_PARENT,
      })),
      spyOn(budgetsService, 'deleteBudget').mockImplementation(async () => undefined),
      spyOn(budgetsService, 'getBudgetById').mockImplementation(async (id) => {
        if (id !== ID) throw new NotFoundError(budgetNotFoundMessage(id));
        return record;
      }),
      spyOn(budgetsService, 'restoreBudget').mockImplementation(async () => record),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it("gets the project's budget (snake_case), 404 while there is none", async () => {
    const res = await app.request(section(PARENT_ID));
    const body = (await res.json()) as { data: { project_id: string } };

    expect(res.status).toBe(200);
    expect(body.data.project_id).toBe(PARENT_ID);
    expect((await app.request(section(EMPTY_PARENT))).status).toBe(404);
  });

  it('PUT creates (201) the first time and updates (200) afterwards', async () => {
    expect((await app.request(section(EMPTY_PARENT), send('PUT', { name: 'Sample' }))).status).toBe(
      201,
    );
    expect((await app.request(section(PARENT_ID), send('PUT', { name: 'Sample' }))).status).toBe(
      200,
    );
  });

  it('rejects an invalid parent id or body (400) before the service', async () => {
    expect((await app.request('/projects/not-a-uuid/budget')).status).toBe(400);
    expect((await app.request(section(PARENT_ID), send('PUT', {}))).status).toBe(400);
  });

  it('deletes under the parent, gets and restores by its own id', async () => {
    expect((await app.request(section(PARENT_ID), { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/budgets/${ID}`)).status).toBe(200);
    expect((await app.request(`/budgets/${MISSING}`)).status).toBe(404);
    expect((await app.request(`/budgets/${ID}/restore`, { method: 'POST' })).status).toBe(200);
  });
});
