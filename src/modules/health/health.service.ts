import { pingDatabase } from '../../database';
import { cacheService } from '../../core/cache';

import type { HealthReport, HealthState } from './health.dto';

export interface HealthProbes {
  pingDatabase: () => Promise<boolean>;
  isCacheReady: () => boolean;
}

const defaultProbes: HealthProbes = {
  pingDatabase: () => pingDatabase(),
  isCacheReady: () => cacheService.isReady(),
};

/** The database is required (DOWN without it); Redis is fail-open (DEGRADED without it). */
export const deriveHealthState = (components: HealthReport['components']): HealthState => {
  if (components.database === 'DOWN') return 'DOWN';
  return components.redis === 'DOWN' ? 'DEGRADED' : 'UP';
};

export class HealthService {
  constructor(private readonly probes: HealthProbes = defaultProbes) {}

  async check(): Promise<HealthReport> {
    const components: HealthReport['components'] = {
      database: (await this.probes.pingDatabase()) ? 'UP' : 'DOWN',
      redis: this.probes.isCacheReady() ? 'UP' : 'DOWN',
    };

    return {
      status: deriveHealthState(components),
      components,
      timestamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
