import { describe, expect, it } from 'bun:test';
import { CacheService } from './cache.service';
import { redisClient } from './redis.client';
import { CACHE_KEYS } from './cache-keys';

describe('CacheService (Unit)', () => {
  it('should generate valid cache keys from CACHE_KEYS SSOT', () => {
    expect(CACHE_KEYS.userDetail('123')).toContain('detail:123');
    expect(CACHE_KEYS.userList(1, 10)).toContain('list:1:10');
  });

  it('should execute fetcher when cache is missed or offline (fail-open)', async () => {
    const service = new CacheService();
    let fetchCount = 0;

    const data = await service.getOrSet('test:fail-open-key', 60, async () => {
      fetchCount += 1;
      return { loaded: true };
    });

    expect(data).toEqual({ loaded: true });
    expect(fetchCount).toBe(1);
  });

  it('should return null safely from get when redis is not ready', async () => {
    const service = new CacheService();
    const result = await service.get('test:not-ready');
    expect(result).toBeNull();
  });

  it('should perform set and del without throwing errors when offline', async () => {
    const service = new CacheService();
    await service.set('test:key', { a: 1 }, 60);
    await service.del('test:key');
    expect(true).toBe(true);
  });

  it('should use redisClient operations when status is ready (Happy Path)', async () => {
    const service = new CacheService();
    const originalStatus = redisClient.status;
    const originalGet = redisClient.get.bind(redisClient);
    const originalSetex = redisClient.setex.bind(redisClient);
    const originalDel = redisClient.del.bind(redisClient);

    try {
      (redisClient as any).status = 'ready';
      (redisClient as any).get = async () => JSON.stringify({ cached: true });
      (redisClient as any).setex = async () => 'OK';
      (redisClient as any).del = async () => 1;

      const cached = await service.getOrSet('test:hit', 60, async () => ({ cached: false }));
      expect(cached).toEqual({ cached: true });

      const fromGet = await service.get('test:hit');
      expect(fromGet).toEqual({ cached: true });

      await service.set('test:hit', { fresh: true }, 60);
      await service.del('test:hit');
    } finally {
      (redisClient as any).status = originalStatus;
      (redisClient as any).get = originalGet;
      (redisClient as any).setex = originalSetex;
      (redisClient as any).del = originalDel;
    }
  });

  it('should handle exceptions gracefully and fail-open when redis operations throw', async () => {
    const service = new CacheService();
    const originalStatus = redisClient.status;
    const originalGet = redisClient.get.bind(redisClient);
    const originalSetex = redisClient.setex.bind(redisClient);
    const originalDel = redisClient.del.bind(redisClient);

    try {
      (redisClient as any).status = 'ready';
      (redisClient as any).get = async () => {
        throw new Error('Redis connection timed out');
      };
      (redisClient as any).setex = async () => {
        throw new Error('Redis write failed');
      };
      (redisClient as any).del = async () => {
        throw new Error('Redis del failed');
      };

      const fallback = await service.getOrSet('test:error', 60, async () => ({ bypassed: true }));
      expect(fallback).toEqual({ bypassed: true });

      const fromGet = await service.get('test:error');
      expect(fromGet).toBeNull();

      await service.set('test:error', { data: 1 }, 60);
      await service.del('test:error');
      expect(true).toBe(true);
    } finally {
      (redisClient as any).status = originalStatus;
      (redisClient as any).get = originalGet;
      (redisClient as any).setex = originalSetex;
      (redisClient as any).del = originalDel;
    }
  });

  it('should report isReady status correctly', () => {
    const service = new CacheService();
    const originalStatus = redisClient.status;

    try {
      (redisClient as any).status = 'ready';
      expect(service.isReady()).toBe(true);

      (redisClient as any).status = 'close';
      expect(service.isReady()).toBe(false);
    } finally {
      (redisClient as any).status = originalStatus;
    }
  });
});
