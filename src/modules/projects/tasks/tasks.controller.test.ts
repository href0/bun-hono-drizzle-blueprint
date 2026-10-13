import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../../core/middlewares';
import type { Task } from '../../../database/schema';
import { taskNotFoundMessage } from './tasks.messages';
import { tasksParentRouter, tasksRouter } from './tasks.routes';
import { tasksService } from './tasks.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

const record: Task = {
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
app.route('/projects/:projectId/tasks', tasksParentRouter);
app.route('/tasks', tasksRouter);
app.onError(globalErrorHandler);

const collection = `/projects/${PARENT_ID}/tasks`;

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('TasksController (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];
  const parents: string[] = [];

  beforeAll(() => {
    spies.push(
      spyOn(tasksService, 'createTask').mockImplementation(async (parentId) => {
        parents.push(parentId);
        return record;
      }),
      spyOn(tasksService, 'listTasks').mockImplementation(async () => ({
        records: [record],
        total: 1,
      })),
      spyOn(tasksService, 'getTaskById').mockImplementation(async (id) => {
        if (id !== ID) throw new NotFoundError(taskNotFoundMessage(id));
        return record;
      }),
      spyOn(tasksService, 'updateTask').mockImplementation(async () => record),
      spyOn(tasksService, 'deleteTask').mockImplementation(async () => undefined),
      spyOn(tasksService, 'restoreTask').mockImplementation(async () => record),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('creates under the project of the path (201, snake_case)', async () => {
    const res = await app.request(collection, send('POST', { name: 'Sample' }));
    const body = (await res.json()) as { data: { project_id: string } };

    expect(res.status).toBe(201);
    expect(body.data.project_id).toBe(PARENT_ID);
    expect(parents).toEqual([PARENT_ID]);
  });

  it('rejects an invalid parent id or body (400) before the service', async () => {
    expect(
      (await app.request('/projects/not-a-uuid/tasks', send('POST', { name: 'x' }))).status,
    ).toBe(400);
    expect((await app.request(collection, send('POST', {}))).status).toBe(400);
  });

  it("lists the project's rows with pagination meta", async () => {
    const res = await app.request(`${collection}?page=1&per_page=10`);
    const body = (await res.json()) as { meta: unknown };

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ current_page: 1, per_page: 10, total_items: 1, total_pages: 1 });
  });

  it('gets by its own id, and a missing id is a 404', async () => {
    expect((await app.request(`/tasks/${ID}`)).status).toBe(200);
    const res = await app.request(`/tasks/${MISSING}`);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('ERR_NOT_FOUND');
  });

  it('updates, deletes and restores by its own id', async () => {
    expect((await app.request(`/tasks/${ID}`, send('PATCH', { name: 'Renamed' }))).status).toBe(
      200,
    );
    expect((await app.request(`/tasks/${ID}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/tasks/${ID}/restore`, { method: 'POST' })).status).toBe(200);
  });
});
