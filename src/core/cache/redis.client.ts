import Redis from 'ioredis';
import { redisConfig } from '../../config';
import { logger } from '../logger/logger';

export const redisClient = new Redis({
  host: redisConfig.REDIS_HOST,
  port: redisConfig.REDIS_PORT,
  password: redisConfig.REDIS_PASSWORD || undefined,
  db: redisConfig.REDIS_DB,
  keyPrefix: redisConfig.REDIS_KEY_PREFIX ? `${redisConfig.REDIS_KEY_PREFIX}:` : undefined,
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
