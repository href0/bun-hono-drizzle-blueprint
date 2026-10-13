import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { Task } from '../../../database/schema';
import { taskResponseSchema } from './tasks.dto';
import { toTaskListResponse, toTaskResponse } from './tasks.transformer';

const record: Task = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  projectId: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a',
  name: 'Sample',
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

describe('toTaskResponse', () => {
  it('exposes exactly the response fields (no audit or soft-delete columns)', () => {
    const response = toTaskResponse(record);

    expect(Object.keys(response).sort()).toEqual(Object.keys(taskResponseSchema.shape).sort());
    expect(response.projectId).toBe(record.projectId);
  });

  it('maps a list', () => {
    expect(toTaskListResponse([record, record])).toHaveLength(2);
  });
});
