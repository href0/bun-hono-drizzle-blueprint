import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { Project } from '../../database/schema';
import { projectResponseSchema } from './projects.dto';
import { toProjectListResponse, toProjectResponse } from './projects.transformer';

const record: Project = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  name: 'Sample',
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

describe('toProjectResponse', () => {
  it('exposes exactly the response fields (no audit or soft-delete columns)', () => {
    const response = toProjectResponse(record);

    expect(Object.keys(response).sort()).toEqual(Object.keys(projectResponseSchema.shape).sort());
    expect(response.name).toBe('Sample');
  });

  it('maps a list', () => {
    expect(toProjectListResponse([record, record])).toHaveLength(2);
  });
});
