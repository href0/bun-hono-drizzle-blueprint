import Redis from 'ioredis';
import { env } from '../../config/env.config';
import { logger } from '../logger/logger';

export const redisClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  keyPrefix: env.REDIS_KEY_PREFIX ? `${env.REDIS_KEY_PREFIX}:` : undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy(times: number): number | null {
    if (times > 3) {
      return null; // Stop retrying after 3 attempts in development/fail-open
    }
    return Math.min(times * 200, 1000);
  },
});

redisClient.on('error', (err) => {
  logger.warn({ err: err.message }, 'Redis client connection error (fail-open mode active)');
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis server');
});
