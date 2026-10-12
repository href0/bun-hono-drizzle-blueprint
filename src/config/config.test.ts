import { describe, expect, it } from 'bun:test';
import { buildAppConfig } from './app.config';
import { buildAuthConfig } from './auth.config';
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
      API_BASE_PATH: '/api',
      API_DOCS_ENABLED: true,
      LOG_LEVEL: 'info',
      DEFAULT_LOCALE: 'id',
    });
    expect(buildAppConfig({ PORT: '8080', LOG_LEVEL: 'debug' })).toMatchObject({
      PORT: 8080,
      LOG_LEVEL: 'debug',
    });
    expect(() => buildAppConfig({ PORT: '0' })).toThrow('PORT');
    for (const bad of ['api', '/api/', '/', '/api v1']) {
      expect(() => buildAppConfig({ API_BASE_PATH: bad })).toThrow('API_BASE_PATH');
    }
    expect(buildAppConfig({ API_BASE_PATH: '/backend/api' }).API_BASE_PATH).toBe('/backend/api');
    expect(buildAppConfig({ DEFAULT_LOCALE: 'en' }).DEFAULT_LOCALE).toBe('en');
    expect(() => buildAppConfig({ DEFAULT_LOCALE: 'fr' })).toThrow(
      'DEFAULT_LOCALE: must be one of: id | en',
    );
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

  const app = { APP_NAME: 'my-app', NODE_ENV: 'production' } as const;

  it('redis: should require REDIS_HOST outside test and default it in test', () => {
    expect(() => buildRedisConfig({ NODE_ENV: 'production' }, app)).toThrow(
      'REDIS_HOST: is required',
    );
    expect(buildRedisConfig({ NODE_ENV: 'test' }, { ...app, NODE_ENV: 'test' })).toEqual({
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      REDIS_DB: 0,
      REDIS_KEY_PREFIX: 'my-app:test',
      REDIS_COMMAND_TIMEOUT_MS: 1000,
    });
  });

  it('redis: should default the key prefix to <APP_NAME>:<NODE_ENV> and accept an override', () => {
    const base = { REDIS_HOST: 'redis' };
    expect(buildRedisConfig(base, app).REDIS_KEY_PREFIX).toBe('my-app:production');
    expect(buildRedisConfig({ ...base, REDIS_KEY_PREFIX: '' }, app).REDIS_KEY_PREFIX).toBe(
      'my-app:production',
    );
    expect(
      buildRedisConfig({ ...base, REDIS_KEY_PREFIX: 'shared:billing-api' }, app).REDIS_KEY_PREFIX,
    ).toBe('shared:billing-api');
  });

  it('redis: should reject malformed key prefixes and non-positive command timeouts', () => {
    const base = { REDIS_HOST: 'redis' };
    for (const prefix of ['my app', 'trailing:', ':leading', 'a::b']) {
      expect(() => buildRedisConfig({ ...base, REDIS_KEY_PREFIX: prefix }, app)).toThrow(
        'REDIS_KEY_PREFIX',
      );
    }
    expect(() => buildRedisConfig({ ...base, REDIS_COMMAND_TIMEOUT_MS: '0' }, app)).toThrow(
      'REDIS_COMMAND_TIMEOUT_MS',
    );
  });

  const dev = { NODE_ENV: 'development' } as const;
  const prod = { NODE_ENV: 'production' } as const;

  it('http: should apply defaults (CORS disabled, no trusted proxy) and coerce numbers', () => {
    expect(buildHttpConfig({}, dev)).toEqual({
      CORS_ORIGINS: [],
      TRUST_PROXY_HOPS: 0,
      HTTP_BODY_LIMIT_BYTES: 1048576,
      RATE_LIMIT_WINDOW_SECONDS: 900,
      RATE_LIMIT_MAX: 100,
    });
    expect(buildHttpConfig({ RATE_LIMIT_MAX: '10', TRUST_PROXY_HOPS: '2' }, dev)).toMatchObject({
      RATE_LIMIT_MAX: 10,
      TRUST_PROXY_HOPS: 2,
    });
    expect(() => buildHttpConfig({ TRUST_PROXY_HOPS: '-1' }, dev)).toThrow('TRUST_PROXY_HOPS');
  });

  it('http: should parse CORS_ORIGINS as a list of exact origins', () => {
    expect(
      buildHttpConfig({ CORS_ORIGINS: ' https://app.example.com , http://localhost:5173 ' }, prod)
        .CORS_ORIGINS,
    ).toEqual(['https://app.example.com', 'http://localhost:5173']);
    for (const bad of ['app.example.com', 'https://app.example.com/', 'https://a.com/path']) {
      expect(() => buildHttpConfig({ CORS_ORIGINS: bad }, dev)).toThrow('CORS_ORIGINS');
    }
  });

  it('http: should allow "*" outside production only', () => {
    expect(buildHttpConfig({ CORS_ORIGINS: '*' }, dev).CORS_ORIGINS).toEqual(['*']);
    expect(() => buildHttpConfig({ CORS_ORIGINS: '*' }, prod)).toThrow(
      'CORS_ORIGINS: "*" is not allowed in production',
    );
  });

  const secret = { JWT_SECRET: 'x'.repeat(32) };

  it('auth: should require a JWT_SECRET of 32+ characters outside test and default it in test', () => {
    expect(() => buildAuthConfig({ NODE_ENV: 'production' }, app)).toThrow(
      'JWT_SECRET: is required',
    );
    expect(() => buildAuthConfig({ NODE_ENV: 'development', JWT_SECRET: '' }, app)).toThrow(
      'JWT_SECRET: must be at least 32 characters',
    );
    expect(() => buildAuthConfig({ JWT_SECRET: 'x'.repeat(31) }, app)).toThrow('JWT_SECRET');
    expect(buildAuthConfig({ NODE_ENV: 'test' }, app).JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('auth: should apply defaults, with issuer and audience falling back to APP_NAME', () => {
    expect(buildAuthConfig(secret, app)).toEqual({
      ...secret,
      JWT_ISSUER: 'my-app',
      JWT_AUDIENCE: 'my-app',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_SECONDS: 604800,
      REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS: 2592000,
      AUTH_COOKIE_SAMESITE: 'Strict',
      AUTH_REGISTRATION_ENABLED: false,
      AUTH_LOGIN_MAX_ATTEMPTS: 5,
      AUTH_LOGIN_LOCK_SECONDS: 900,
    });
    expect(
      buildAuthConfig(
        { ...secret, JWT_ISSUER: 'issuer', JWT_AUDIENCE: 'web', AUTH_REGISTRATION_ENABLED: 'true' },
        app,
      ),
    ).toMatchObject({ JWT_ISSUER: 'issuer', JWT_AUDIENCE: 'web', AUTH_REGISTRATION_ENABLED: true });
  });

  it('auth: should reject invalid values without echoing them', () => {
    expect(() => buildAuthConfig({ ...secret, AUTH_COOKIE_SAMESITE: 'strict' }, app)).toThrow(
      'AUTH_COOKIE_SAMESITE: must be one of: Strict | Lax | None',
    );
    expect(() => buildAuthConfig({ ...secret, ACCESS_TOKEN_TTL_SECONDS: '0' }, app)).toThrow(
      'ACCESS_TOKEN_TTL_SECONDS',
    );
    expect(() =>
      buildAuthConfig(
        { ...secret, REFRESH_TOKEN_TTL_SECONDS: '3600', REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS: '60' },
        app,
      ),
    ).toThrow('REFRESH_TOKEN_TTL_SECONDS: must not exceed REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS');
    const leak = 'short-secret-value';
    const message = (() => {
      try {
        buildAuthConfig({ JWT_SECRET: leak }, app);
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toContain('JWT_SECRET');
    expect(message).not.toContain(leak);
  });

  it('integrations: should reject an invalid base URL', () => {
    expect(buildIntegrationsConfig({}).JSONPLACEHOLDER_TIMEOUT_MS).toBe(10000);
    expect(() => buildIntegrationsConfig({ JSONPLACEHOLDER_BASE_URL: 'not-a-url' })).toThrow(
      'JSONPLACEHOLDER_BASE_URL',
    );
  });
});
