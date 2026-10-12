import type Redis from 'ioredis';
import { redisClient } from './redis.client';
import { logger } from '../logger/logger';

/** The slice of the Redis client the cache uses — injectable so tests need no live Redis. */
export type CacheClient = Pick<Redis, 'status' | 'get' | 'set' | 'del' | 'eval'>;

export interface GetOrSetOptions<T> {
  /** Cache a `null` fetcher result for this many seconds (absent = never cache `null`). */
  negativeTtl?: number;
  /**
   * Rebuilds a cached value from its JSON form on a hit — e.g. ISO strings back into
   * `Temporal.Instant` (`parseInstant`), so a hit has the same types as a miss. A reviver that
   * throws turns the hit into a miss (fail-open). Not called for a cached `null`.
   */
  revive?: (raw: unknown) => T;
}

export interface CounterState {
  count: number;
  /** Seconds until the counter window resets. */
  ttlSeconds: number;
}

/** Marks a cached "not found", distinct from a cache miss. */
const NIL_SENTINEL = '{"__nil":1}';

/**
 * `INCR` + expire-if-no-TTL, atomic in one round trip: the window starts with the first hit and is
 * never extended by later ones; a key left without a TTL gets one. Same semantics as
 * `EXPIRE … NX` but without its Redis ≥ 7 requirement (`EXPIRE` with 3 args errors on older
 * servers, which would silently disable every rate limit through fail-open).
 */
export const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Every method fails open: when Redis is down, slow or returns garbage the caller carries on as
 * if the cache were empty (and a `warn` is logged) — a request never fails because of Redis.
 */
export class CacheService {
  constructor(private readonly client: CacheClient = redisClient) {}

  isReady(): boolean {
    return this.client.status === 'ready';
  }

  /**
   * Cache-aside. A fetcher error propagates and nothing is cached. `null` is cached only with
   * `negativeTtl` (use it for lookups keyed by untrusted input); `undefined` is never cached.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
    options: GetOrSetOptions<T> = {},
  ): Promise<T> {
    const cached = await this.readRaw(key);
    if (cached !== null) {
      const hit = this.decode(key, cached);
      if (hit.ok) {
        const value = this.revive(key, hit.value, options.revive);
        if (value.ok) {
          logger.debug({ key }, 'Cache hit');
          return value.value as T;
        }
      }
    }

    const fresh = await fetcher();
    const result: unknown = fresh;

    if (result === null) {
      if (options.negativeTtl !== undefined) {
        await this.write(key, options.negativeTtl, () => NIL_SENTINEL);
      }
    } else if (result !== undefined) {
      await this.write(key, ttlSeconds, () => JSON.stringify(fresh));
    }

    return fresh;
  }

  private revive(
    key: string,
    raw: unknown,
    reviver: ((raw: unknown) => unknown) | undefined,
  ): { ok: true; value: unknown } | { ok: false } {
    if (reviver === undefined || raw === null) return { ok: true, value: raw };
    try {
      return { ok: true, value: reviver(raw) };
    } catch (error) {
      logger.warn(
        { key, err: error instanceof Error ? error.message : String(error) },
        'Cached value could not be revived',
      );
      return { ok: false };
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.readRaw(key);
    if (cached === null) return null;
    const hit = this.decode(key, cached);
    return hit.ok ? (hit.value as T) : null;
  }

  async set(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    await this.write(key, ttlSeconds, () => JSON.stringify(data));
  }

  async del(key: string): Promise<void> {
    if (!this.isReady()) return;
    try {
      await this.client.del(key);
    } catch (err: unknown) {
      logger.warn({ key, err: errorMessage(err) }, 'Redis del failed (failing open)');
    }
  }

  /**
   * `SET NX EX` — `true` when this call stored the value (first claim of a nonce, lock, …).
   * Fails open: returns `true` when Redis is unavailable.
   */
  async setIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    if (!this.isReady()) {
      logger.warn({ key }, 'Redis not ready; setIfAbsent failing open');
      return true;
    }
    try {
      const encoded = JSON.stringify(value);
      const result = await this.client.set(key, encoded, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err: unknown) {
      logger.warn({ key, err: errorMessage(err) }, 'Redis setIfAbsent failed (failing open)');
      return true;
    }
  }

  /**
   * Atomically counts a hit in a fixed window of `ttlSeconds` (rate limiting).
   * Fails open: returns `null` when Redis is unavailable — callers must then allow the request.
   */
  async increment(key: string, ttlSeconds: number): Promise<CounterState | null> {
    if (!this.isReady()) {
      logger.warn({ key }, 'Redis not ready; increment failing open');
      return null;
    }
    try {
      const result = await this.client.eval(INCREMENT_SCRIPT, 1, key, ttlSeconds);
      if (
        !Array.isArray(result) ||
        typeof result[0] !== 'number' ||
        typeof result[1] !== 'number'
      ) {
        throw new Error('Unexpected increment script reply');
      }
      return { count: result[0], ttlSeconds: result[1] };
    } catch (err: unknown) {
      logger.warn({ key, err: errorMessage(err) }, 'Redis increment failed (failing open)');
      return null;
    }
  }

  private async readRaw(key: string): Promise<string | null> {
    if (!this.isReady()) return null;
    try {
      return await this.client.get(key);
    } catch (err: unknown) {
      logger.warn({ key, err: errorMessage(err) }, 'Redis read failed (failing open)');
      return null;
    }
  }

  /** `encode` runs inside the guard: an unserializable value (BigInt, cycle) also fails open. */
  private async write(key: string, ttlSeconds: number, encode: () => string): Promise<void> {
    if (!this.isReady()) return;
    try {
      await this.client.set(key, encode(), 'EX', ttlSeconds);
      logger.debug({ key, ttlSeconds }, 'Cache set');
    } catch (err: unknown) {
      logger.warn({ key, err: errorMessage(err) }, 'Redis write failed (failing open)');
    }
  }

  /** Corrupt entries count as a miss rather than an error. */
  private decode(key: string, raw: string): { ok: true; value: unknown } | { ok: false } {
    if (raw === NIL_SENTINEL) return { ok: true, value: null };
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch (err: unknown) {
      logger.warn({ key, err: errorMessage(err) }, 'Corrupt cache entry ignored');
      return { ok: false };
    }
  }
}

export const cacheService = new CacheService();
