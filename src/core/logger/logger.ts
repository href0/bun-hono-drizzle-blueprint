import pino from 'pino';
import { env } from '../../config/env.config';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
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
  transport: isDev
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
    app: env.APP_NAME,
    env: env.NODE_ENV,
  },
});
