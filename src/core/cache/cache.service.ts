import { redisClient } from './redis.client';
import { logger } from '../logger/logger';

export class CacheService {
  async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    try {
      if (redisClient.status === 'ready' || redisClient.status === 'connect') {
        const cached = await redisClient.get(key);
        if (cached) {
          logger.debug({ key }, 'Cache hit');
          return JSON.parse(cached) as T;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ key, err: message }, 'Redis cache read error, bypassing to fetcher');
    }

    // Execute fallback fetcher
    const freshData = await fetcher();

    try {
      if (redisClient.status === 'ready' || redisClient.status === 'connect') {
        await redisClient.setex(key, ttlSeconds, JSON.stringify(freshData));
        logger.debug({ key, ttlSeconds }, 'Cache set');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ key, err: message }, 'Redis cache write error');
    }

    return freshData;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (redisClient.status === 'ready' || redisClient.status === 'connect') {
        const cached = await redisClient.get(key);
        return cached ? (JSON.parse(cached) as T) : null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ key, err: message }, 'Redis cache get error');
    }
    return null;
  }

  async set(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    try {
      if (redisClient.status === 'ready' || redisClient.status === 'connect') {
        await redisClient.setex(key, ttlSeconds, JSON.stringify(data));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ key, err: message }, 'Redis cache set error');
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (redisClient.status === 'ready' || redisClient.status === 'connect') {
        await redisClient.del(key);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ key, err: message }, 'Redis cache del error');
    }
  }

  isReady(): boolean {
    return redisClient.status === 'ready' || redisClient.status === 'connect';
  }
}

export const cacheService = new CacheService();
