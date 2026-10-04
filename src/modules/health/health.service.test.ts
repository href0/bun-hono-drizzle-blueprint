import { describe, expect, it, mock, beforeEach } from 'bun:test';

// Mock database module
const mockPingDatabase = mock(async () => Promise.resolve(true));
void mock.module('../../database', () => ({
  pingDatabase: mockPingDatabase,
}));

// Mock cache service module
const mockIsReady = mock(() => true);
void mock.module('../../core/cache', () => ({
  cacheService: {
    isReady: mockIsReady,
  },
}));

import { checkReadinessStatus } from './health.service';

describe('checkReadinessStatus() (Unit)', () => {
  beforeEach(() => {
    mockPingDatabase.mockReset();
    mockIsReady.mockReset();
  });

  it('should return ready status when DB ping succeeds and Redis is available', async () => {
    mockPingDatabase.mockResolvedValue(true);
    mockIsReady.mockReturnValue(true);

    const status = await checkReadinessStatus();

    expect(status.status).toBe('ready');
    expect(status.database).toBe('ok');
    expect(status.redis).toBe('ok');
    expect(typeof status.timestamp).toBe('string');
  });

  it('should return not_ready status when DB ping fails', async () => {
    mockPingDatabase.mockResolvedValue(false);
    mockIsReady.mockReturnValue(true);

    const status = await checkReadinessStatus();

    expect(status.status).toBe('not_ready');
    expect(status.database).toBe('unavailable');
    expect(status.redis).toBe('ok');
  });

  it('should return degraded redis status but still ready if Redis is unavailable', async () => {
    mockPingDatabase.mockResolvedValue(true);
    mockIsReady.mockReturnValue(false);

    const status = await checkReadinessStatus();

    expect(status.status).toBe('ready');
    expect(status.database).toBe('ok');
    expect(status.redis).toBe('degraded');
  });
});
