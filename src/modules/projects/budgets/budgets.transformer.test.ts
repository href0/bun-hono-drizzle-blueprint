import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { Budget } from '../../../database/schema';
import { budgetResponseSchema } from './budgets.dto';
import { toBudgetResponse } from './budgets.transformer';

const record: Budget = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  projectId: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a',
  name: 'Sample',
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

describe('toBudgetResponse', () => {
  it('exposes exactly the response fields (no audit or soft-delete columns)', () => {
    const response = toBudgetResponse(record);

    expect(Object.keys(response).sort()).toEqual(Object.keys(budgetResponseSchema.shape).sort());
    expect(response.projectId).toBe(record.projectId);
  });
});
