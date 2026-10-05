import { describe, expect, it } from 'bun:test';
import pino from 'pino';
import { buildLoggerOptions, wallClockTimestamp } from './logger';

describe('buildLoggerOptions (Unit)', () => {
  it('should use the pretty transport in development, timed in the display zone', () => {
    const options = buildLoggerOptions(
      { NODE_ENV: 'development', LOG_LEVEL: 'debug', APP_NAME: 'sample-app' },
      'Asia/Jayapura',
    );

    expect(options.level).toBe('debug');
    expect(options.transport).toMatchObject({
      target: 'pino-pretty',
      options: { translateTime: false },
    });
    expect(options.base).toEqual({ app: 'sample-app', env: 'development' });

    const timestamp = (options.timestamp as () => string)();
    expect(timestamp).toMatch(/^,"time":"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \+09:00"$/);
  });

  it('should emit JSON with an ISO 8601 UTC time outside development and redact sensitive keys', () => {
    const options = buildLoggerOptions(
      { NODE_ENV: 'production', LOG_LEVEL: 'info', APP_NAME: 'sample-app' },
      'Asia/Jakarta',
    );

    expect(options.transport).toBeUndefined();
    expect(options.timestamp).toBe(pino.stdTimeFunctions.isoTime);
    expect((options.timestamp as () => string)()).toMatch(
      /^,"time":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/,
    );
    expect(options.redact).toMatchObject({ censor: '[REDACTED]' });
    expect((options.redact as { paths: string[] }).paths).toContain('*.password');
  });
});

describe('wallClockTimestamp', () => {
  it('prints the offset of the zone, so the time is unambiguous', () => {
    expect(wallClockTimestamp('UTC')()).toContain(' +00:00"');
    expect(wallClockTimestamp('Asia/Jakarta')()).toContain(' +07:00"');
  });
});
