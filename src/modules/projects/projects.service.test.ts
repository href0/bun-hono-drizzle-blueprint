import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '../../core/errors';
import type { Project } from '../../database/schema';
import type { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

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

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

/** A repository that knows exactly one live row (`ID`) and records what it was asked. */
const fakeRepository = (calls: unknown[][]): ProjectsRepository =>
  ({
    create: async (values: unknown) => {
      calls.push(['create', values]);
      return record;
    },
    findById: async (id: string) => (id === ID ? record : null),
    findPage: async (options: unknown) => {
      calls.push(['findPage', options]);
      return [record];
    },
    count: async () => 1,
    updateById: async (id: string, values: Partial<Project>) => {
      calls.push(['updateById', id, values]);
      return id === ID ? { ...record, ...values } : null;
    },
    softDeleteById: async (id: string) => (id === ID ? record : null),
    restoreById: async (id: string) => (id === ID ? record : null),
  }) as unknown as ProjectsRepository;

describe('ProjectsService (Unit)', () => {
  it('creates from the DTO', async () => {
    const calls: unknown[][] = [];
    const service = new ProjectsService(fakeRepository(calls));

    expect(await service.createProject({ name: 'Sample' })).toBe(record);
    expect(calls).toEqual([['create', { name: 'Sample' }]]);
  });

  it('finds by id; a missing row is a NotFoundError', async () => {
    const service = new ProjectsService(fakeRepository([]));

    expect(await service.getProjectById(ID)).toBe(record);
    expect(await rejectionOf(service.getProjectById(MISSING))).toBeInstanceOf(NotFoundError);
  });

  it('lists a page with the total', async () => {
    const calls: unknown[][] = [];
    const service = new ProjectsService(fakeRepository(calls));

    expect(await service.listProjects({ page: 2, perPage: 10 })).toEqual({
      records: [record],
      total: 1,
    });
    expect(calls).toEqual([['findPage', { page: 2, perPage: 10 }]]);
  });

  it('updates, deletes and restores; each is a NotFoundError for a missing row', async () => {
    const calls: unknown[][] = [];
    const service = new ProjectsService(fakeRepository(calls));

    expect((await service.updateProject(ID, { isActive: false })).isActive).toBe(false);
    expect(calls).toContainEqual(['updateById', ID, { isActive: false }]);
    await service.deleteProject(ID);
    expect(await service.restoreProject(ID)).toBe(record);
    for (const attempt of [
      service.updateProject(MISSING, { name: 'x' }),
      service.deleteProject(MISSING),
      service.restoreProject(MISSING),
    ]) {
      expect(await rejectionOf(attempt)).toBeInstanceOf(NotFoundError);
    }
  });
});
