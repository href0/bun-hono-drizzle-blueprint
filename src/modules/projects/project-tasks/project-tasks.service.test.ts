import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import type { ProjectTask } from '../../../database/schema';
import type { ProjectTasksRepository } from './project-tasks.repository';
import { ProjectTasksService } from './project-tasks.service';

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

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

/** A repository that knows exactly one live row (`ID`) and records what it was asked. */
const fakeRepository = (calls: unknown[][]): ProjectTasksRepository =>
  ({
    createForParent: async (parentId: string, values: unknown) => {
      calls.push(['createForParent', parentId, values]);
      return record;
    },
    findProjectTaskList: async (parentId: string, query: unknown) => {
      calls.push(['findProjectTaskList', parentId, query]);
      return { rows: [record], total: 1 };
    },
    findById: async (id: string) => (id === ID ? record : null),
    updateById: async (id: string, values: Partial<ProjectTask>) => {
      calls.push(['updateById', id, values]);
      return id === ID ? { ...record, ...values } : null;
    },
    softDeleteById: async (id: string) => (id === ID ? record : null),
    restoreById: async (id: string) => (id === ID ? record : null),
  }) as unknown as ProjectTasksRepository;

describe('ProjectTasksService (Unit)', () => {
  it('creates under the project from the path', async () => {
    const calls: unknown[][] = [];
    const service = new ProjectTasksService(fakeRepository(calls));

    expect(await service.createProjectTask(PARENT_ID, { name: 'Sample' })).toBe(record);
    expect(calls).toEqual([['createForParent', PARENT_ID, { name: 'Sample' }]]);
  });

  it("lists a page of the project's rows with the total", async () => {
    const calls: unknown[][] = [];
    const service = new ProjectTasksService(fakeRepository(calls));

    const query = { page: 2, perPage: 10, q: 'sam' };
    expect(await service.listProjectTasks(PARENT_ID, query)).toEqual({
      records: [record],
      total: 1,
    });
    expect(calls).toEqual([['findProjectTaskList', PARENT_ID, query]]);
  });

  it('finds, updates, deletes and restores by id; each is a NotFoundError for a missing row', async () => {
    const calls: unknown[][] = [];
    const service = new ProjectTasksService(fakeRepository(calls));

    expect(await service.getProjectTaskById(ID)).toBe(record);
    expect((await service.updateProjectTask(ID, { name: 'Renamed' })).name).toBe('Renamed');
    expect(calls).toContainEqual(['updateById', ID, { name: 'Renamed' }]);
    await service.deleteProjectTask(ID);
    expect(await service.restoreProjectTask(ID)).toBe(record);
    for (const attempt of [
      service.getProjectTaskById(MISSING),
      service.updateProjectTask(MISSING, { name: 'x' }),
      service.deleteProjectTask(MISSING),
      service.restoreProjectTask(MISSING),
    ]) {
      expect(await rejectionOf(attempt)).toBeInstanceOf(NotFoundError);
    }
  });
});
