import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../../core/middlewares';
import type { ProjectTask } from '../../../database/schema';
import { projectTaskNotFoundMessage } from './project-tasks.messages';
import { projectTasksParentRouter, projectTasksRouter } from './project-tasks.routes';
import { projectTasksService } from './project-tasks.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

const record: ProjectTask = {
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
app.route('/projects/:projectId/tasks', projectTasksParentRouter);
app.route('/project-tasks', projectTasksRouter);
app.onError(globalErrorHandler);

const collection = `/projects/${PARENT_ID}/tasks`;

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('ProjectTasksController (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];
  const parents: string[] = [];
  let list: ReturnType<typeof spyOn>;

  beforeAll(() => {
    list = spyOn(projectTasksService, 'listProjectTasks').mockImplementation(async () => ({
      records: [record],
      total: 1,
    }));
    spies.push(
      list,
      spyOn(projectTasksService, 'createProjectTask').mockImplementation(async (parentId) => {
        parents.push(parentId);
        return record;
      }),
      spyOn(projectTasksService, 'getProjectTaskById').mockImplementation(async (id) => {
        if (id !== ID) throw new NotFoundError(projectTaskNotFoundMessage(id));
        return record;
      }),
      spyOn(projectTasksService, 'updateProjectTask').mockImplementation(async () => record),
      spyOn(projectTasksService, 'deleteProjectTask').mockImplementation(async () => undefined),
      spyOn(projectTasksService, 'restoreProjectTask').mockImplementation(async () => record),
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

  it('passes sort and q parsed; a column outside the allowlist or an unknown parameter is a 400', async () => {
    list.mockClear();
    expect((await app.request(`${collection}?sort=-name&q=sam`)).status).toBe(200);
    expect(list.mock.calls[0]?.[1]).toEqual({
      page: 1,
      perPage: 10,
      sort: [{ field: 'name', direction: 'desc' }],
      q: 'sam',
    });

    for (const query of ['sort=created_by', 'project_id=x']) {
      expect((await app.request(`${collection}?${query}`)).status).toBe(400);
    }
  });

  it('gets by its own id, and a missing id is a 404', async () => {
    expect((await app.request(`/project-tasks/${ID}`)).status).toBe(200);
    const res = await app.request(`/project-tasks/${MISSING}`);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('ERR_NOT_FOUND');
  });

  it('updates, deletes and restores by its own id', async () => {
    expect(
      (await app.request(`/project-tasks/${ID}`, send('PATCH', { name: 'Renamed' }))).status,
    ).toBe(200);
    expect((await app.request(`/project-tasks/${ID}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/project-tasks/${ID}/restore`, { method: 'POST' })).status).toBe(
      200,
    );
  });
});
