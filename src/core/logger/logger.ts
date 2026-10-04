import pino, { type LoggerOptions } from 'pino';
import { appConfig, type AppConfig } from '../../config';
import { getRequestContext } from '../context/request-context';

/** Adds request correlation to every log line, so callers never pass `requestId` manually. */
export const requestContextMixin = (): Record<string, string> => {
  const context = getRequestContext();
  return context ? { requestId: context.requestId, actor: context.actor } : {};
};

/**
 * Builds Pino options from validated config. Kept pure so every environment branch
 * (pretty transport in development, JSON elsewhere) is unit-testable.
 */
export const buildLoggerOptions = (
  config: Pick<AppConfig, 'NODE_ENV' | 'LOG_LEVEL' | 'APP_NAME'>,
): LoggerOptions => ({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'token',
      '*.token',
      'req.headers.authorization',
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
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
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

export const logger = pino(buildLoggerOptions(appConfig));
