/**
 * Example dependent modules (D33) — HTTP contract through createApp(): the parent `projects`
 * (standalone), its `project-tasks` (1:N) and its `project-budgets` (1:1), each child in a subfolder
 * of the parent, named after it and mounted in shallow nesting (`/projects/:id/tasks`, `/project-tasks/:id`). The services are stubbed with spyOn (never mock.module()); the parent
 * rules (hidden while the parent is deleted, parentScope, locks) are covered in
 * src/database/dependent.repository.test.ts and against PostgreSQL in the integration suite.
 * Removed with the modules by `bun run setup <name>`.
 */
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import type { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { createApp } from '../src/app';
import { authorize } from './helpers/authorized-app';
import { NotFoundError } from '../src/core/errors';
import { projectBudgetsService } from '../src/modules/projects/project-budgets/project-budgets.service';
import { projectTasksService } from '../src/modules/projects/project-tasks/project-tasks.service';
import type { ProjectBudget, ProjectTask } from '../src/database/schema';

const AT = Temporal.Instant.from('2026-10-05T03:00:00Z');
const PROJECT_ID = '0192f1d0-0000-7000-8000-000000000001';
const OTHER_PROJECT = '0192f1d0-0000-7000-8000-0000000000ff';
const audit = {
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};
const TASK: ProjectTask = {
  id: '0192f1d0-0000-7000-8000-00000000000a',
  projectId: PROJECT_ID,
  name: 'Design',
  ...audit,
};
const BUDGET: ProjectBudget = {
  id: '0192f1d0-0000-7000-8000-00000000000b',
  projectId: PROJECT_ID,
  name: 'Q4',
  ...audit,
};

/** Another project's id behaves like a missing / deleted / foreign parent: 404. */
const ensureProject = (projectId: string): void => {
  if (projectId !== PROJECT_ID) throw new NotFoundError();
};

describe('Projects with tasks (1:N) and a budget (1:1) — example dependent modules, E2E contract', () => {
  let app: Hono;
  const spies: ReturnType<typeof spyOn>[] = [];
  const parents: string[] = [];

  beforeAll(async () => {
    spies.push(
      spyOn(projectTasksService, 'createProjectTask').mockImplementation(async (projectId, dto) => {
        ensureProject(projectId);
        parents.push(projectId);
        return { ...TASK, ...dto };
      }),
      spyOn(projectTasksService, 'listProjectTasks').mockImplementation(async (projectId) => {
        ensureProject(projectId);
        return { records: [TASK], total: 1 };
      }),
      spyOn(projectTasksService, 'getProjectTaskById').mockImplementation(async () => TASK),
      spyOn(projectTasksService, 'deleteProjectTask').mockImplementation(async () => undefined),
      spyOn(projectBudgetsService, 'getProjectBudget').mockImplementation(async (projectId) => {
        ensureProject(projectId);
        return BUDGET;
      }),
      spyOn(projectBudgetsService, 'saveProjectBudget').mockImplementation(
        async (projectId, dto) => {
          ensureProject(projectId);
          return { row: { ...BUDGET, ...dto }, created: true };
        },
      ),
      spyOn(projectBudgetsService, 'getProjectBudgetById').mockImplementation(async () => BUDGET),
    );
    app = await authorize(createApp());
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  const call = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: { data?: unknown; meta?: unknown } }> => {
    const res = await app.request(`/api/v1${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as never };
  };

  it('tasks: created and listed under the project of the path, read and deleted by their own id', async () => {
    const created = await call('POST', `/projects/${PROJECT_ID}/tasks`, { name: 'Design' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ project_id: PROJECT_ID, name: 'Design' });
    expect(parents).toEqual([PROJECT_ID]);
    expect(
      (await call('GET', `/projects/${PROJECT_ID}/tasks?page=1&per_page=10`)).body.meta,
    ).toEqual({
      current_page: 1,
      per_page: 10,
      total_items: 1,
      total_pages: 1,
    });
    expect((await call('GET', `/project-tasks/${TASK.id}`)).status).toBe(200);
    expect((await call('DELETE', `/project-tasks/${TASK.id}`)).status).toBe(200);
  });

  it('budget: the 1:1 section in the singular under its project', async () => {
    expect((await call('GET', `/projects/${PROJECT_ID}/budget`)).body.data).toMatchObject({
      name: 'Q4',
    });
    expect((await call('PUT', `/projects/${PROJECT_ID}/budget`, { name: 'Q1' })).status).toBe(201);
    expect((await call('GET', `/project-budgets/${BUDGET.id}`)).status).toBe(200);
  });

  it('a project that is missing, deleted or not visible to the caller is a 404 for its children', async () => {
    expect((await call('GET', `/projects/${OTHER_PROJECT}/tasks`)).status).toBe(404);
    expect((await call('PUT', `/projects/${OTHER_PROJECT}/budget`, { name: 'x' })).status).toBe(
      404,
    );
  });

  it('the parent id in the path is validated before any service call (400)', async () => {
    expect((await call('GET', '/projects/not-a-uuid/tasks')).status).toBe(400);
    expect((await call('GET', '/projects/not-a-uuid/budget')).status).toBe(400);
  });
});
