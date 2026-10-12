import pino, { type LoggerOptions } from 'pino';
import { appConfig, hostTimeZone, type AppConfig } from '../../config';
import { formatWallClock, nowInstant } from '../../utils/datetime.util';
import { getRequestContext } from '../context/request-context';

/** Adds request correlation to every log line, so callers never pass `requestId` manually. */
export const requestContextMixin = (): Record<string, string> => {
  const context = getRequestContext();
  return context ? { requestId: context.requestId, actor: context.actor } : {};
};

/** `"time"` in the wall clock of `zone` with its offset, e.g. `2026-10-05 11:27:43.123 +07:00`. */
export const wallClockTimestamp =
  (zone: string): (() => string) =>
  () =>
    `,"time":"${formatWallClock(nowInstant(), zone)}"`;

/**
 * Builds Pino options from validated config. Kept pure so every environment branch is unit-testable:
 * - development: pretty single-line logs timed in `displayTimeZone` (the host's zone — follows the
 *   developer wherever they are, offset printed so it stays unambiguous);
 * - elsewhere: JSON lines with an ISO 8601 UTC `time`, readable raw on a server and parsed natively
 *   by log pipelines, which show it in each viewer's own zone.
 */
export const buildLoggerOptions = (
  config: Pick<AppConfig, 'NODE_ENV' | 'LOG_LEVEL' | 'APP_NAME'>,
  displayTimeZone: string,
): LoggerOptions => ({
  level: config.LOG_LEVEL,
  timestamp:
    config.NODE_ENV === 'development'
      ? wallClockTimestamp(displayTimeZone)
      : pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'token',
      '*.token',
      'accessToken',
      '*.accessToken',
      'refreshToken',
      '*.refreshToken',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'authorization',
      'apiKey',
      '*.apiKey',
      'secret',
      '*.secret',
      'nik',
      'creditCard',
    ],
    censor: '[REDACTED]',
  },
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: false, // `time` is already a wall-clock string (wallClockTimestamp)
            ignore: 'pid,hostname',
            singleLine: true,
          },
        }
      : undefined,
  base: {
    app: config.APP_NAME,
    env: config.NODE_ENV,
  },
  mixin: requestContextMixin,
});

export const logger = pino(buildLoggerOptions(appConfig, hostTimeZone));
