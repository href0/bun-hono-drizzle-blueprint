# Redis Cache Infrastructure & Fail-Open Pattern — Implementation Guide

Read this file when: caching service results, defining cache keys, or configuring Redis TTLs.

---

## 1. Directory Structure (`src/core/cache/`)

```
src/core/cache/
├── cache-keys.ts    # Single Source of Truth (SSOT) for keys, prefixes, and TTLs
├── cache.service.ts # Public API for caching (getOrSet, get, set, del)
├── redis.client.ts  # ioredis client instance (singleton)
└── index.ts         # Barrel export
```

---

## 2. Core Operational Rules

1. **Always Use `CacheService`, Never `redisClient` Directly**:
   - `CacheService` encapsulates serialization, deserialization, and fail-open error handling.
2. **SSOT Key Generation (`cache-keys.ts`)**:
   - NEVER hardcode string keys like `'user:123'`. Define generator functions in `CACHE_KEYS`:
   ```typescript
   export const CACHE_KEYS = {
     userDetail: (id: string) => `users:detail:${id}`,
     userList: (page: number, limit: number) => `users:list:${page}:${limit}`,
   };
   ```
3. **Fail-Open Guarantee**:
   - If Redis is disconnected, down, or encounters a read/write timeout, `CacheService` logs a warning and bypasses Redis directly to the fallback `fetcher` callback. The user request **NEVER crashes** because of Redis outages.

---

## 3. Usage Example (Cache-Aside Pattern)

```typescript
import { CacheService, CACHE_KEYS } from '../../core/cache';

export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly cacheService: CacheService = new CacheService(),
  ) {}

  async getUserById(id: string): Promise<User> {
    const key = CACHE_KEYS.userDetail(id);
    const ttlSeconds = 300; // 5 minutes

    return this.cacheService.getOrSet(key, ttlSeconds, async () => {
      const user = await this.repository.findById(id);
      if (!user) {
        throw new NotFoundError(userNotFoundMessage(id));
      }
      return user;
    });
  }
}
```
