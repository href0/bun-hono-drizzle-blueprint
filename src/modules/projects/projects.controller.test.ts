import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../core/errors';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import type { Project } from '../../database/schema';
import { projectNotFoundMessage } from './projects.messages';
import { projectsRouter } from './projects.routes';
import { projectsService } from './projects.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';

const record: Project = {
  id: ID,
  name: 'Sample',
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const app = new Hono();
app.use('*', requestContextMiddleware());
app.route('/', projectsRouter);
app.onError(globalErrorHandler);

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('ProjectsController (through its routes)', () => {
  const spies: { mockRestore: () => void }[] = [];

  beforeAll(() => {
    spies.push(
      spyOn(projectsService, 'createProject').mockImplementation(async () => record),
      spyOn(projectsService, 'getProjectById').mockImplementation(async (id) => {
        if (id !== ID) throw new NotFoundError(projectNotFoundMessage(id));
        return record;
      }),
      spyOn(projectsService, 'listProjects').mockImplementation(async () => ({
        records: [record],
        total: 1,
      })),
      spyOn(projectsService, 'updateProject').mockImplementation(async () => record),
      spyOn(projectsService, 'deleteProject').mockImplementation(async () => undefined),
      spyOn(projectsService, 'restoreProject').mockImplementation(async () => record),
    );
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  it('creates (201) and answers in snake_case', async () => {
    const res = await app.request('/', send('POST', { name: 'Sample' }));
    const body = (await res.json()) as { data: { is_active: boolean; created_at: string } };

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ is_active: true, created_at: '2026-10-05T03:00:00.000Z' });
  });

  it('rejects invalid input (400) before the service', async () => {
    expect((await app.request('/', send('POST', {}))).status).toBe(400);
  });

  it('lists with pagination meta', async () => {
    const res = await app.request('/?page=1&per_page=10');
    const body = (await res.json()) as { meta: unknown };

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ current_page: 1, per_page: 10, total_items: 1, total_pages: 1 });
  });

  it('gets by id, and a missing id is a 404', async () => {
    expect((await app.request(`/${ID}`)).status).toBe(200);
    const res = await app.request(`/${MISSING}`);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('ERR_NOT_FOUND');
  });

  it('updates, deletes and restores', async () => {
    expect((await app.request(`/${ID}`, send('PATCH', { is_active: false }))).status).toBe(200);
    expect((await app.request(`/${ID}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/${ID}/restore`, { method: 'POST' })).status).toBe(200);
  });
});
