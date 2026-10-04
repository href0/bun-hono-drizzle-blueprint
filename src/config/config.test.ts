import { describe, expect, it } from 'bun:test';
import { buildAppConfig } from './app.config';
import { buildDatabaseConfig } from './database.config';
import { buildHttpConfig } from './http.config';
import { buildIntegrationsConfig } from './integrations.config';
import { buildRedisConfig } from './redis.config';

describe('Configuration groups (Unit)', () => {
  it('app: should apply defaults and reject an invalid port', () => {
    expect(buildAppConfig({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_NAME: expect.any(String),
      API_PREFIX: '/api/v1',
      LOG_LEVEL: 'info',
    });
    expect(buildAppConfig({ PORT: '8080', LOG_LEVEL: 'debug' })).toMatchObject({
      PORT: 8080,
      LOG_LEVEL: 'debug',
    });
    expect(() => buildAppConfig({ PORT: '0' })).toThrow('PORT');
    expect(() => buildAppConfig({ API_PREFIX: 'api' })).toThrow('API_PREFIX');
  });

  it('database: should require DATABASE_URL outside test and default it in test', () => {
    expect(() => buildDatabaseConfig({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL: is required',
    );
    expect(buildDatabaseConfig({ NODE_ENV: 'test' }).DATABASE_URL).toStartWith('postgresql://');
    expect(
      buildDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@db:5432/app',
        DB_MAX_CONNECTIONS: '5',
      }),
    ).toMatchObject({ DB_MAX_CONNECTIONS: 5, DB_IDLE_TIMEOUT_SECONDS: 30 });
  });

  it('redis: should require REDIS_HOST outside test and default it in test', () => {
    expect(() => buildRedisConfig({ NODE_ENV: 'production' })).toThrow('REDIS_HOST: is required');
    expect(buildRedisConfig({ NODE_ENV: 'test' })).toEqual({
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      REDIS_DB: 0,
      REDIS_KEY_PREFIX: '',
    });
  });

  it('http: should apply defaults and coerce numbers', () => {
    expect(buildHttpConfig({})).toEqual({
      CORS_ORIGIN: '*',
      RATE_LIMIT_WINDOW_MS: 900000,
      RATE_LIMIT_MAX: 100,
    });
    expect(buildHttpConfig({ RATE_LIMIT_MAX: '10' }).RATE_LIMIT_MAX).toBe(10);
  });

  it('integrations: should reject an invalid base URL', () => {
    expect(buildIntegrationsConfig({}).JSONPLACEHOLDER_TIMEOUT_MS).toBe(10000);
    expect(() => buildIntegrationsConfig({ JSONPLACEHOLDER_BASE_URL: 'not-a-url' })).toThrow(
      'JSONPLACEHOLDER_BASE_URL',
    );
  });
});
