import { describe, expect, it } from 'bun:test';
import {
  databaseConfig,
  // partner:start
  partnerConfig,
  // partner:end
  redisConfig,
} from '../src/config';
import { sqlClient } from '../src/database/connection';
import { pingDatabase } from '../src/database/health-probe';
import { HERMETIC_ENV } from './setup/hermetic-env';

describe('hermetic test environment (bunfig.toml preload)', () => {
  it('points every service at a closed local port, never at the developer services', () => {
    expect(databaseConfig.DATABASE_URL).toBe(HERMETIC_ENV.DATABASE_URL);
    expect(redisConfig.REDIS_HOST).toBe('127.0.0.1');
    expect(redisConfig.REDIS_PORT).toBe(1);
    expect(process.env.NODE_ENV).toBe('test');
  });

  // partner:start
  it('uses the test partner keyring, never the developer keyring (it encrypts real secrets)', () => {
    expect(partnerConfig.PARTNER_SECRET_ACTIVE_KEY_ID).toBe(
      HERMETIC_ENV.PARTNER_SECRET_ACTIVE_KEY_ID,
    );
    expect(partnerConfig.PARTNER_SECRET_KEYS).toEqual({ test: '0'.repeat(64) });
  });
  // partner:end

  it('runs in UTC whatever the host zone (D13)', () => {
    expect(process.env.TZ).toBe('UTC');
    expect(new Date(0).getTimezoneOffset()).toBe(0);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
  });

  it('asks PostgreSQL for a UTC session (startup parameter, sent on connect)', () => {
    const options = (sqlClient as unknown as { options: { connection: Record<string, string> } })
      .options;
    expect(options.connection.timezone).toBe('UTC');
  });

  it('fails a database probe immediately instead of reaching a real server', async () => {
    const started = performance.now();
    expect(await pingDatabase()).toBe(false);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
