import { describe, expect, it } from 'bun:test';
import { deriveHealthState, HealthService, type HealthProbes } from './health.service';

const probes = (database: boolean, redis: boolean): HealthProbes => ({
  pingDatabase: () => Promise.resolve(database),
  isCacheReady: () => redis,
});

describe('deriveHealthState', () => {
  it('is DOWN without the database, DEGRADED without Redis, UP with both', () => {
    expect(deriveHealthState({ database: 'UP', redis: 'UP' })).toBe('UP');
    expect(deriveHealthState({ database: 'UP', redis: 'DOWN' })).toBe('DEGRADED');
    expect(deriveHealthState({ database: 'DOWN', redis: 'UP' })).toBe('DOWN');
    expect(deriveHealthState({ database: 'DOWN', redis: 'DOWN' })).toBe('DOWN');
  });
});

describe('HealthService.check', () => {
  it('reports every component and the derived state', async () => {
    const report = await new HealthService(probes(true, false)).check();

    expect(report.status).toBe('DEGRADED');
    expect(report.components).toEqual({ database: 'UP', redis: 'DOWN' });
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  });

  it('uses the real probes by default (database unreachable and Redis lazy in tests)', async () => {
    const report = await new HealthService().check();
    expect(report.components.redis).toBe('DOWN');
    expect(['UP', 'DOWN']).toContain(report.components.database);
  });
});
