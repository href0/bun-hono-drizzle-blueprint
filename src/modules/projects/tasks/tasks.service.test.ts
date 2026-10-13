import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../../core/errors';
import type { Task } from '../../../database/schema';
import type { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

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

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

/** A repository that knows exactly one live row (`ID`) and records what it was asked. */
const fakeRepository = (calls: unknown[][]): TasksRepository =>
  ({
    createForParent: async (parentId: string, values: unknown) => {
      calls.push(['createForParent', parentId, values]);
      return record;
    },
    findPageForParent: async (parentId: string, options: unknown) => {
      calls.push(['findPageForParent', parentId, options]);
      return [record];
    },
    countForParent: async () => 1,
    findById: async (id: string) => (id === ID ? record : null),
    updateById: async (id: string, values: Partial<Task>) => {
      calls.push(['updateById', id, values]);
      return id === ID ? { ...record, ...values } : null;
    },
    softDeleteById: async (id: string) => (id === ID ? record : null),
    restoreById: async (id: string) => (id === ID ? record : null),
  }) as unknown as TasksRepository;

describe('TasksService (Unit)', () => {
  it('creates under the project from the path', async () => {
    const calls: unknown[][] = [];
    const service = new TasksService(fakeRepository(calls));

    expect(await service.createTask(PARENT_ID, { name: 'Sample' })).toBe(record);
    expect(calls).toEqual([['createForParent', PARENT_ID, { name: 'Sample' }]]);
  });

  it("lists a page of the project's rows with the total", async () => {
    const calls: unknown[][] = [];
    const service = new TasksService(fakeRepository(calls));

    expect(await service.listTasks(PARENT_ID, { page: 2, perPage: 10 })).toEqual({
      records: [record],
      total: 1,
    });
    expect(calls).toEqual([['findPageForParent', PARENT_ID, { page: 2, perPage: 10 }]]);
  });

  it('finds, updates, deletes and restores by id; each is a NotFoundError for a missing row', async () => {
    const calls: unknown[][] = [];
    const service = new TasksService(fakeRepository(calls));

    expect(await service.getTaskById(ID)).toBe(record);
    expect((await service.updateTask(ID, { name: 'Renamed' })).name).toBe('Renamed');
    expect(calls).toContainEqual(['updateById', ID, { name: 'Renamed' }]);
    await service.deleteTask(ID);
    expect(await service.restoreTask(ID)).toBe(record);
    for (const attempt of [
      service.getTaskById(MISSING),
      service.updateTask(MISSING, { name: 'x' }),
      service.deleteTask(MISSING),
      service.restoreTask(MISSING),
    ]) {
      expect(await rejectionOf(attempt)).toBeInstanceOf(NotFoundError);
    }
  });
});
