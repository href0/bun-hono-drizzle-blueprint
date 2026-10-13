import { describe, expect, it } from 'bun:test';
import { redisConfig } from '../../src/config';
import { CacheService, cacheService } from '../../src/core/cache';
import {
  closeRedisClient,
  createRedisClient,
  redisClient,
} from '../../src/core/cache/redis.client';
import { unique } from '../helpers/integration';

/**
 * CacheService on a real Redis (plan step 6.1): the Lua script, atomicity under concurrency and
 * fail-open on a dropped connection — server behaviour that the unit tests' fakes cannot show.
 * Keys live under the run's prefix (REDIS_KEY_PREFIX) and are deleted by the runner.
 */

const serverVersion = async (): Promise<number[]> => {
  const info = await redisClient.info('server');
  return (/redis_version:([\d.]+)/.exec(info)?.at(1) ?? '0').split('.').map((part) => Number(part));
};

const waitUntil = async (condition: () => boolean, timeoutMs = 5000): Promise<void> => {
  const deadline = performance.now() + timeoutMs;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('condition not met in time');
    await Bun.sleep(25);
  }
};

describe('Redis server', () => {
  it('runs the suite on Redis ≥ 2.6 (EVAL) with the run’s own key prefix', async () => {
    const [major = 0, minor = 0] = await serverVersion();
    expect(major * 100 + minor).toBeGreaterThanOrEqual(206);
    expect(redisClient.options.keyPrefix).toBe(`${redisConfig.REDIS_KEY_PREFIX}:`);
    expect(redisConfig.REDIS_KEY_PREFIX).toContain(':int-test:');
  });
});

describe('CacheService.increment (Lua INCREMENT_SCRIPT)', () => {
  it('counts 50 concurrent hits exactly once each, with one window TTL', async () => {
    const key = unique('rate-limit:int');

    const counters = await Promise.all(
      Array.from({ length: 50 }, () => cacheService.increment(key, 60)),
    );

    expect(counters.map((counter) => counter?.count).sort((a = 0, b = 0) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    const ttl = await redisClient.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('keeps the window of the first hit (later hits never extend it)', async () => {
    const key = unique('rate-limit:int');
    await cacheService.increment(key, 60);
    await redisClient.expire(key, 5);

    const counter = await cacheService.increment(key, 60);

    expect(counter?.count).toBe(2);
    expect(counter?.ttlSeconds).toBeLessThanOrEqual(5);
  });
});

describe('CacheService primitives', () => {
  it('setIfAbsent: of 20 concurrent claims exactly one wins (nonce, lock)', async () => {
    const key = unique('nonce:int');

    const claims = await Promise.all(
      Array.from({ length: 20 }, () => cacheService.setIfAbsent(key, 1, 30)),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await redisClient.ttl(key)).toBeGreaterThan(0);
  });

  it('getOrSet: caches a value and a miss (negativeTtl), so the fetcher runs once per key', async () => {
    const hitKey = unique('lookup:int');
    const missKey = unique('lookup:int');
    let fetches = 0;
    const fetchValue = (): Promise<{ name: string }> => {
      fetches += 1;
      return Promise.resolve({ name: 'cached' });
    };
    const fetchNothing = (): Promise<null> => {
      fetches += 1;
      return Promise.resolve(null);
    };

    expect(await cacheService.getOrSet(hitKey, 30, fetchValue)).toEqual({ name: 'cached' });
    expect(await cacheService.getOrSet(hitKey, 30, fetchValue)).toEqual({ name: 'cached' });
    expect(await cacheService.getOrSet(missKey, 30, fetchNothing, { negativeTtl: 30 })).toBeNull();
    expect(await cacheService.getOrSet(missKey, 30, fetchNothing, { negativeTtl: 30 })).toBeNull();
    expect(fetches).toBe(2);

    await cacheService.del(hitKey);
    expect(await cacheService.get(hitKey)).toBeNull();
  });
});

describe('fail-open on a dropped connection', () => {
  it('answers without Redis while reconnecting, and works again once it is back', async () => {
    const client = createRedisClient(redisConfig);
    const cache = new CacheService(client);
    const key = unique('fail-open:int');
    try {
      await client.connect();
      expect(await cache.setIfAbsent(key, 1, 30)).toBe(true);

      // The connection drops (server restart, network): ioredis reconnects in the background.
      // Right after the drop the status may still read `ready` (commands are then rejected and
      // caught); while reconnecting it is not ready (commands are skipped). Both fail open.
      client.disconnect(true);
      const expectFailOpen = async (): Promise<void> => {
        expect(await cache.get(key)).toBeNull();
        expect(await cache.increment(key, 30)).toBeNull();
        expect(await cache.setIfAbsent(key, 1, 30)).toBe(true);
        expect(await cache.getOrSet(key, 30, () => Promise.resolve('from source'))).toBe(
          'from source',
        );
      };
      await expectFailOpen();
      await waitUntil(() => client.status === 'reconnecting');
      expect(cache.isReady()).toBe(false);
      await expectFailOpen();

      await waitUntil(() => cache.isReady());
      // Back: the key claimed before the drop is still there.
      expect(await cache.setIfAbsent(key, 1, 30)).toBe(false);
    } finally {
      await closeRedisClient(client);
    }
  });
});
