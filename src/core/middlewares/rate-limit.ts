import type { Context, MiddlewareHandler } from 'hono';
import { CACHE_KEYS, cacheService, type CacheService } from '../cache';
import { getClientIp } from '../context/request-context';
import { TooManyRequestsError } from '../errors';
import { UNKNOWN_CLIENT_IP } from './client-ip';

/**
 * `skip` helper: true for `prefix` itself and paths below it, on segment boundaries —
 * `/api/v1/health` matches `/api/v1/health/readiness` but not `/api/v1/health-records`.
 */
export const isUnderPath =
  (prefix: string) =>
  (c: Context): boolean =>
    c.req.path === prefix || c.req.path.startsWith(`${prefix}/`);

export interface RateLimitOptions {
  /** Length of the fixed window; it starts with the caller's first request. */
  windowSeconds: number;
  /** Requests allowed per window; request `max + 1` gets 429. */
  max: number;
  /** Separates independent limits on the same caller, e.g. `global`, `login`. */
  keyPrefix: string;
  /** Requests that bypass this limit (e.g. health probes). */
  skip?: (c: Context) => boolean;
  cache?: CacheService;
}

/**
 * Fixed-window limit per trusted client IP, shared by every instance through Redis.
 * Sends `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` (seconds) and, once over the
 * limit, a 429 with `Retry-After`. Fails open: when Redis is unavailable the request passes.
 */
export const rateLimit = ({
  windowSeconds,
  max,
  keyPrefix,
  skip,
  cache = cacheService,
}: RateLimitOptions): MiddlewareHandler => {
  return async (c, next) => {
    if (skip?.(c)) {
      await next();
      return;
    }

    const subject = getClientIp() ?? UNKNOWN_CLIENT_IP;
    const counter = await cache.increment(CACHE_KEYS.rateLimit(keyPrefix, subject), windowSeconds);
    if (counter === null) {
      await next();
      return;
    }

    const resetSeconds = counter.ttlSeconds > 0 ? counter.ttlSeconds : windowSeconds;
    c.header('RateLimit-Limit', String(max));
    c.header('RateLimit-Remaining', String(Math.max(max - counter.count, 0)));
    c.header('RateLimit-Reset', String(resetSeconds));

    if (counter.count > max) {
      throw new TooManyRequestsError(undefined, { retryAfterSeconds: resetSeconds });
    }
    await next();
  };
};
