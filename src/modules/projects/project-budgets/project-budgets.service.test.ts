import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { ConflictError, NotFoundError } from '../../../core/errors';
import type { ProjectBudget } from '../../../database/schema';
import type { ProjectBudgetsRepository } from './project-budgets.repository';
import { ProjectBudgetsService } from './project-budgets.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const MISSING = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';
const TAKEN = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9b';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';
const EMPTY_PARENT = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9c';

const record: ProjectBudget = {
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

/** A unique violation as postgres.js reports it (SQLSTATE 23505). */
const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

/** PARENT_ID has one live row (`ID`); EMPTY_PARENT has none; restoring TAKEN collides. */
const fakeRepository = (calls: unknown[][]): ProjectBudgetsRepository =>
  ({
    findOneForParent: async (parentId: string) => (parentId === PARENT_ID ? record : null),
    upsertForParent: async (parentId: string, values: unknown) => {
      calls.push(['upsertForParent', parentId, values]);
      return { row: record, created: parentId === EMPTY_PARENT };
    },
    softDeleteForParent: async (parentId: string) => (parentId === PARENT_ID ? record : null),
    findById: async (id: string) => (id === ID ? record : null),
    restoreById: async (id: string) => {
      if (id === TAKEN) throw uniqueViolation;
      return id === ID ? record : null;
    },
  }) as unknown as ProjectBudgetsRepository;

describe('ProjectBudgetsService (Unit)', () => {
  it("gets the project's row; none yet is a NotFoundError", async () => {
    const service = new ProjectBudgetsService(fakeRepository([]));

    expect(await service.getProjectBudget(PARENT_ID)).toBe(record);
    expect(await rejectionOf(service.getProjectBudget(EMPTY_PARENT))).toBeInstanceOf(NotFoundError);
  });

  it('saves (create or update) under the project from the path', async () => {
    const calls: unknown[][] = [];
    const service = new ProjectBudgetsService(fakeRepository(calls));

    expect((await service.saveProjectBudget(EMPTY_PARENT, { name: 'Sample' })).created).toBe(true);
    expect((await service.saveProjectBudget(PARENT_ID, { name: 'Sample' })).created).toBe(false);
    expect(calls.at(0)).toEqual(['upsertForParent', EMPTY_PARENT, { name: 'Sample' }]);
  });

  it('deletes the row; none yet is a NotFoundError', async () => {
    const service = new ProjectBudgetsService(fakeRepository([]));

    await service.deleteProjectBudget(PARENT_ID);
    expect(await rejectionOf(service.deleteProjectBudget(EMPTY_PARENT))).toBeInstanceOf(
      NotFoundError,
    );
  });

  it('finds and restores by id; missing is a NotFoundError, a live sibling a ConflictError', async () => {
    const service = new ProjectBudgetsService(fakeRepository([]));

    expect(await service.getProjectBudgetById(ID)).toBe(record);
    expect(await service.restoreProjectBudget(ID)).toBe(record);
    expect(await rejectionOf(service.getProjectBudgetById(MISSING))).toBeInstanceOf(NotFoundError);
    expect(await rejectionOf(service.restoreProjectBudget(MISSING))).toBeInstanceOf(NotFoundError);
    expect(await rejectionOf(service.restoreProjectBudget(TAKEN))).toBeInstanceOf(ConflictError);
  });
});
