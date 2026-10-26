import type { Context, MiddlewareHandler } from 'hono';
import { CACHE_KEYS, cacheService, type CacheService } from '../cache';
import { getClientIp } from '../context/request-context';
import { TooManyRequestsError } from '../errors';
import { UNKNOWN_CLIENT_IP } from './client-ip';

/**
 * `skip` helper: true for each `prefix` itself and paths below it, on segment boundaries —
 * `/api/health` matches `/api/health/readiness` but not `/api/health-records`.
 */
export const isUnderPath =
  (...prefixes: [string, ...string[]]) =>
  (c: Context): boolean =>
    prefixes.some((prefix) => c.req.path === prefix || c.req.path.startsWith(`${prefix}/`));

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

/** Statuses that count as a refused attempt for `rejectionLimit()`. */
const REJECTED_STATUSES: ReadonlySet<number> = new Set([401, 403]);

/**
 * Fixed-window limit on **refused** attempts (401 / 403) per trusted client IP, for routes that
 * authenticate the caller themselves and bypass the global `rateLimit()` — vendor webhooks (bursts
 * of retries from a few IPs) and signed gateways with their own per-caller quota. Accepted requests
 * never count, so a busy caller is limited only by its own quota, while a client guessing keys or
 * signatures gets 429 (`Retry-After` = the window, an upper bound) before its requests reach the
 * credential lookup. No `RateLimit-*` headers: the caller's own quota owns them.
 * Fails open like `rateLimit()`.
 */
export const rejectionLimit = ({
  windowSeconds,
  max,
  keyPrefix,
  cache = cacheService,
}: Omit<RateLimitOptions, 'skip'>): MiddlewareHandler => {
  return async (c, next) => {
    const key = CACHE_KEYS.rateLimit(keyPrefix, getClientIp() ?? UNKNOWN_CLIENT_IP);
    const refused = await cache.get<unknown>(key);
    if (typeof refused === 'number' && refused >= max) {
      throw new TooManyRequestsError(undefined, { retryAfterSeconds: windowSeconds });
    }
    await next();
    if (REJECTED_STATUSES.has(c.res.status)) {
      await cache.increment(key, windowSeconds);
    }
  };
};
