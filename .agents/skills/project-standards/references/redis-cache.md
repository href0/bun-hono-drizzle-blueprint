# Redis Cache Infrastructure & Fail-Open Pattern — Implementation Guide

Read this file when: caching service results, defining cache keys or TTLs, rate limiting, claiming nonces/locks, or configuring Redis.

---

## 1. Directory Structure (`src/core/cache/`)

```
src/core/cache/
├── cache-keys.ts    # Single Source of Truth (SSOT) for key builders, prefixes, and TTLs
├── cache.service.ts # Public API: getOrSet, get, set, del, setIfAbsent, increment, isReady
├── redis.client.ts  # SafeRedis client singleton (resilience options, blocked commands)
└── index.ts         # Barrel export (CacheService, cacheService, CACHE_KEYS, CACHE_TTL, …)
```

---

## 2. Core Operational Rules

1. **Always use `CacheService`, never `redisClient` directly.** `CacheService` owns serialization, the readiness check and fail-open error handling. Only `src/index.ts` touches `redisClient` (connect on startup, `quit()` on shutdown).
2. **SSOT key generation (`cache-keys.ts`).** Never hardcode keys like `'user:123'`; add a builder to `CACHE_KEYS` and a TTL to `CACHE_TTL`:
   ```typescript
   export const CACHE_KEYS = {
     userDetail: (id: string): string => `${CACHE_PREFIX.USER}detail:${id}`,
   } as const;
   ```
   Do not add the project/environment prefix yourself — the client adds it (§4).
3. **Fail-open guarantee.** When Redis is down, slow (> `REDIS_COMMAND_TIMEOUT_MS`), not yet ready, or returns a corrupt entry, every `CacheService` method behaves as if the cache were empty and logs a `warn`. A request **never fails because of Redis**.
4. **Inject, don't import, in services.** Take `cache: CacheService = cacheService` as a constructor default so unit tests pass `new CacheService(fakeClient)` (see `cache.service.test.ts`) instead of mocking modules.

---

## 3. `CacheService` API

| Method                                           | Redis                       | When Redis is unavailable           |
| ------------------------------------------------ | --------------------------- | ----------------------------------- |
| `getOrSet(key, ttl, fetcher, { negativeTtl })`   | `GET`, then `SET … EX`      | runs `fetcher`, returns its result  |
| `get(key)` / `set(key, value, ttl)` / `del(key)` | `GET` / `SET … EX` / `DEL`  | `null` / no-op / no-op              |
| `setIfAbsent(key, value, ttl)`                   | `SET … EX … NX`             | `true` (claim granted) + `warn`     |
| `increment(key, windowSeconds)`                  | Lua `INCR` + `EXPIRE NX`    | `null` (caller must allow) + `warn` |
| `isReady()`                                      | client `status === 'ready'` | `false`                             |

- **`getOrSet`**: a fetcher error propagates and **nothing is cached** (e.g. `NotFoundError`). `undefined` is never cached; `null` is cached only when `negativeTtl` is given, stored as the sentinel `{"__nil":1}` and served back as `null`. Use `negativeTtl` (short, e.g. 30–60 s) for lookups keyed by **untrusted input** (API keys, tokens, slugs) so repeated misses cannot hammer the database.
- **`setIfAbsent`**: `true` only for the first caller while the key lives — nonces, idempotency keys, simple locks. It fails open (`true`), so never rely on it as the _only_ replay defence for money-moving operations.
- **`increment`**: fixed-window counter returning `{ count, ttlSeconds }`; the window starts at the first hit and later hits never extend it (`EXPIRE … NX`, Redis ≥ 7). `ttlSeconds` feeds `Retry-After` / `RateLimit-Reset`.
- Values are JSON: a cached `Date` comes back as an ISO string. Transformers must not rely on `instanceof Date` for cached entities.

---

## 4. Client Resilience (`redis.client.ts`, `REDIS_*` in `src/config/redis.config.ts`)

| Concern            | Behaviour                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Reconnect          | Never gives up: `retryStrategy` backs off 500 ms × attempt, capped at 30 s                             |
| Slow Redis         | `commandTimeout = REDIS_COMMAND_TIMEOUT_MS` (default 1000) — the command fails, the cache fails open   |
| Disconnected       | `enableOfflineQueue: false`, `maxRetriesPerRequest: 0` — commands fail immediately instead of queueing |
| Key prefix         | Always on: `REDIS_KEY_PREFIX` or, when empty, `<APP_NAME>:<NODE_ENV>` (+ `:`), applied by ioredis      |
| Dangerous commands | `FLUSHALL`, `FLUSHDB`, `KEYS` are rejected by `SafeRedis.sendCommand` (methods, `call()`, pipelines)   |
| Startup            | `lazyConnect`; `src/index.ts` connects and only warns when Redis is down — the app starts degraded     |

Use `SCAN` with a pattern or TTL expiry instead of `KEYS`; never wipe a database from application code.

---

## 5. Usage Example (Cache-Aside Pattern)

```typescript
import { CacheService, cacheService, CACHE_KEYS, CACHE_TTL } from '../../core/cache';

export class UsersService {
  constructor(
    private readonly repo: UsersRepository = usersRepository,
    private readonly cache: CacheService = cacheService,
  ) {}

  async getUserById(id: string): Promise<User> {
    return this.cache.getOrSet(CACHE_KEYS.userDetail(id), CACHE_TTL.USER_DETAIL, async () => {
      const user = await this.repo.findById(id);
      if (!user) {
        throw new NotFoundError(userNotFoundMessage(id)); // propagates, not cached
      }
      return user;
    });
  }
}
```

Invalidate on writes with `await this.cache.del(CACHE_KEYS.userDetail(id))` once the write has succeeded.
