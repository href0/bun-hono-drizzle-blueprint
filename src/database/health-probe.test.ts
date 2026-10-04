import { describe, expect, it, mock } from 'bun:test';

// Mock connection module before importing probe
const mockSql = mock(async () => Promise.resolve([{ '?column?': 1 }]));
void mock.module('./connection', () => ({
  sqlClient: mockSql,
  db: {},
}));

import { pingDatabase } from './health-probe';

describe('pingDatabase()', () => {
  it('should return true when query executes successfully', async () => {
    mockSql.mockResolvedValueOnce([{ '?column?': 1 }]);
    const result = await pingDatabase();
    expect(result).toBe(true);
  });

  it('should return false when query throws an error', async () => {
    mockSql.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await pingDatabase();
    expect(result).toBe(false);
  });
});
