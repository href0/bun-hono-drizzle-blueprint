import { pingDatabase } from '../../database';
import { cacheService } from '../../core/cache';

export interface HealthStatus {
  status: 'ready' | 'not_ready';
  database: 'ok' | 'unavailable';
  redis: 'ok' | 'degraded';
  timestamp: string;
}

/**
 * Probes all infrastructure dependencies and returns a structured health status.
 * Database failure → status: 'not_ready'. Redis failure → status stays 'ready' (fail-open).
 */
export const checkReadinessStatus = async (): Promise<HealthStatus> => {
  const isDbHealthy = await pingDatabase();
  const database: 'ok' | 'unavailable' = isDbHealthy ? 'ok' : 'unavailable';
  const redis: 'ok' | 'degraded' = cacheService.isReady() ? 'ok' : 'degraded';
  const status: 'ready' | 'not_ready' = database === 'ok' ? 'ready' : 'not_ready';

  return {
    status,
    database,
    redis,
    timestamp: new Date().toISOString(),
  };
};
