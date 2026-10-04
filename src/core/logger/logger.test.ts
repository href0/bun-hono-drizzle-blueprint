import { describe, expect, it } from 'bun:test';
import { buildLoggerOptions } from './logger';

describe('buildLoggerOptions (Unit)', () => {
  it('should use the pretty transport in development', () => {
    const options = buildLoggerOptions({
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      APP_NAME: 'sample-app',
    });

    expect(options.level).toBe('debug');
    expect(options.transport).toMatchObject({ target: 'pino-pretty' });
    expect(options.base).toEqual({ app: 'sample-app', env: 'development' });
  });

  it('should emit plain JSON outside development and redact sensitive keys', () => {
    const options = buildLoggerOptions({
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      APP_NAME: 'sample-app',
    });

    expect(options.transport).toBeUndefined();
    expect(options.redact).toMatchObject({ censor: '[REDACTED]' });
    expect((options.redact as { paths: string[] }).paths).toContain('*.password');
  });
});
