import { describe, expect, it, mock } from 'bun:test';

// Mock connection module before importing probe
const mockSql = mock(async () => Promise.resolve([{ '?column?': 1 }]));
void mock.module('./connection', () => ({
  sqlClient: mockSql,
  db: {},
}));

import { DB_PING_TIMEOUT_MS, pingDatabase } from './health-probe';

describe('pingDatabase()', () => {
  it('should return true when query executes successfully', async () => {
    mockSql.mockResolvedValueOnce([{ '?column?': 1 }]);
    expect(await pingDatabase()).toBe(true);
  });

  it('should return false when query throws an error', async () => {
    mockSql.mockRejectedValueOnce(new Error('Connection refused'));
    expect(await pingDatabase()).toBe(false);
  });

  it('should return false once the timeout elapses when the database never answers', async () => {
    mockSql.mockImplementationOnce(() => new Promise(() => undefined));
    const started = performance.now();

    expect(await pingDatabase(30)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('should default to a timeout shorter than typical probe timeouts', () => {
    expect(DB_PING_TIMEOUT_MS).toBe(2000);
  });
});
