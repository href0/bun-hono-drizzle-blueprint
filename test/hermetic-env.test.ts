import { describe, expect, it } from 'bun:test';
import { databaseConfig, redisConfig } from '../src/config';
import { pingDatabase } from '../src/database/health-probe';
import { HERMETIC_ENV } from './setup/hermetic-env';

describe('hermetic test environment (bunfig.toml preload)', () => {
  it('points every service at a closed local port, never at the developer services', () => {
    expect(databaseConfig.DATABASE_URL).toBe(HERMETIC_ENV.DATABASE_URL);
    expect(redisConfig.REDIS_HOST).toBe('127.0.0.1');
    expect(redisConfig.REDIS_PORT).toBe(1);
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('fails a database probe immediately instead of reaching a real server', async () => {
    const started = performance.now();
    expect(await pingDatabase()).toBe(false);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
