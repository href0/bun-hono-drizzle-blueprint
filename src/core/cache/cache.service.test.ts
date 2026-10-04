import { describe, expect, it, mock } from 'bun:test';
import { CacheService, INCREMENT_SCRIPT, type CacheClient } from './cache.service';
import { CACHE_KEYS } from './cache-keys';

/** Awaits a promise expected to reject and returns the error (Bun types `.rejects` as void). */
const rejectionOf = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (err: unknown) {
    if (err instanceof Error) return err;
  }
  throw new Error('expected the promise to reject with an Error');
};

/** In-memory stand-in for the Redis client; `fail` makes every command reject. */
const fakeClient = (
  options: { status?: string; fail?: boolean; evalReply?: unknown } = {},
): CacheClient & { store: Map<string, { value: string; ttl: number }> } => {
  const store = new Map<string, { value: string; ttl: number }>();
  const guard = (): void => {
    if (options.fail) throw new Error('Command timed out');
  };
  const client = {
    store,
    status: options.status ?? 'ready',
    get: mock(async (key: string) => {
      guard();
      return store.get(key)?.value ?? null;
    }),
    set: mock(async (key: string, value: string, _ex: 'EX', ttl: number, nx?: 'NX') => {
      guard();
      if (nx && store.has(key)) return null;
      store.set(key, { value, ttl });
      return 'OK';
    }),
    del: mock(async (key: string) => {
      guard();
      return store.delete(key) ? 1 : 0;
    }),
    eval: mock(async (_script: string, _numKeys: number, key: string, ttl: number) => {
      guard();
      if ('evalReply' in options) return options.evalReply;
      const count = Number(store.get(key)?.value ?? 0) + 1;
      store.set(key, { value: String(count), ttl: store.get(key)?.ttl ?? ttl });
      return [count, store.get(key)?.ttl];
    }),
  };
  return client as unknown as CacheClient & typeof client;
};

describe('CACHE_KEYS', () => {
  it('builds keys from the single source of truth', () => {
    expect(CACHE_KEYS.userDetail('123')).toBe('user:detail:123');
  });
});

describe('CacheService', () => {
  describe('isReady', () => {
    it('is true only for status "ready" (offline queue is off, so "connect" cannot serve)', () => {
      expect(new CacheService(fakeClient({ status: 'ready' })).isReady()).toBe(true);
      for (const status of ['connect', 'connecting', 'reconnecting', 'wait', 'end']) {
        expect(new CacheService(fakeClient({ status })).isReady()).toBe(false);
      }
    });
  });

  describe('getOrSet', () => {
    it('returns the cached value on a hit without calling the fetcher', async () => {
      const client = fakeClient();
      client.store.set('k', { value: JSON.stringify({ cached: true }), ttl: 60 });
      const fetcher = mock(async () => ({ cached: false }));

      expect(await new CacheService(client).getOrSet('k', 60, fetcher)).toEqual({ cached: true });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('fetches and stores on a miss', async () => {
      const client = fakeClient();
      const value = await new CacheService(client).getOrSet('k', 60, async () => ({ a: 1 }));

      expect(value).toEqual({ a: 1 });
      expect(client.store.get('k')).toEqual({ value: '{"a":1}', ttl: 60 });
    });

    it('does not cache when the fetcher throws', async () => {
      const client = fakeClient();
      const service = new CacheService(client);

      const error = await rejectionOf(
        service.getOrSet('k', 60, async () => {
          throw new Error('not found');
        }),
      );
      expect(error.message).toBe('not found');
      expect(client.set).not.toHaveBeenCalled();
    });

    it('caches null only with negativeTtl, and serves it back as null', async () => {
      const client = fakeClient();
      const service = new CacheService(client);

      expect(await service.getOrSet('plain', 60, async () => null)).toBeNull();
      expect(client.store.has('plain')).toBe(false);

      expect(await service.getOrSet('neg', 60, async () => null, { negativeTtl: 5 })).toBeNull();
      expect(client.store.get('neg')).toEqual({ value: '{"__nil":1}', ttl: 5 });

      const fetcher = mock(async () => 'fresh');
      expect(await service.getOrSet<string | null>('neg', 60, fetcher)).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('never caches undefined', async () => {
      const client = fakeClient();
      const fetcher = async (): Promise<string | undefined> => undefined;
      const value = await new CacheService(client).getOrSet('k', 60, fetcher);
      expect(value).toBeUndefined();
      expect(client.set).not.toHaveBeenCalled();
    });

    it('treats a corrupt entry as a miss', async () => {
      const client = fakeClient();
      client.store.set('k', { value: '{not json', ttl: 60 });

      expect(await new CacheService(client).getOrSet('k', 60, async () => 'fresh')).toBe('fresh');
      expect(client.store.get('k')?.value).toBe('"fresh"');
    });

    it('fails open when Redis is not ready', async () => {
      const client = fakeClient({ status: 'reconnecting' });
      expect(await new CacheService(client).getOrSet('k', 60, async () => 'fresh')).toBe('fresh');
      expect(client.get).not.toHaveBeenCalled();
      expect(client.set).not.toHaveBeenCalled();
    });

    it('fails open when Redis commands reject', async () => {
      const client = fakeClient({ fail: true });
      expect(await new CacheService(client).getOrSet('k', 60, async () => 'fresh')).toBe('fresh');
    });

    it('fails open when the value cannot be serialized', async () => {
      const client = fakeClient();
      expect(await new CacheService(client).getOrSet('k', 60, async () => 10n)).toBe(10n);
      expect(client.store.has('k')).toBe(false);
    });
  });

  describe('get / set / del', () => {
    it('round-trips a value and deletes it', async () => {
      const service = new CacheService(fakeClient());

      await service.set('k', { a: 1 }, 60);
      expect(await service.get<{ a: number }>('k')).toEqual({ a: 1 });
      await service.del('k');
      expect(await service.get('k')).toBeNull();
    });

    it('get returns null for the negative-cache sentinel and for corrupt entries', async () => {
      const client = fakeClient();
      client.store.set('nil', { value: '{"__nil":1}', ttl: 5 });
      client.store.set('bad', { value: '{oops', ttl: 5 });
      const service = new CacheService(client);

      expect(await service.get('nil')).toBeNull();
      expect(await service.get('bad')).toBeNull();
    });

    it('fail open when Redis is not ready or commands reject', async () => {
      for (const client of [fakeClient({ status: 'end' }), fakeClient({ fail: true })]) {
        const service = new CacheService(client);
        await service.set('k', 1, 60);
        expect(await service.get('k')).toBeNull();
        await service.del('k');
      }
    });
  });

  describe('setIfAbsent', () => {
    it('is true for the first claim and false while the key exists', async () => {
      const client = fakeClient();
      const service = new CacheService(client);

      expect(await service.setIfAbsent('nonce:1', 1, 300)).toBe(true);
      expect(await service.setIfAbsent('nonce:1', 1, 300)).toBe(false);
      expect(client.store.get('nonce:1')).toEqual({ value: '1', ttl: 300 });
    });

    it('fails open (true) when Redis is not ready or the command rejects', async () => {
      expect(await new CacheService(fakeClient({ status: 'end' })).setIfAbsent('k', 1, 5)).toBe(
        true,
      );
      expect(await new CacheService(fakeClient({ fail: true })).setIfAbsent('k', 1, 5)).toBe(true);
    });
  });

  describe('increment', () => {
    it('counts hits and keeps the window of the first hit', async () => {
      const client = fakeClient();
      const service = new CacheService(client);

      expect(await service.increment('rl:ip', 60)).toEqual({ count: 1, ttlSeconds: 60 });
      expect(await service.increment('rl:ip', 999)).toEqual({ count: 2, ttlSeconds: 60 });
      expect(client.eval).toHaveBeenLastCalledWith(INCREMENT_SCRIPT, 1, 'rl:ip', 999);
    });

    it('fails open (null) when Redis is not ready, rejects, or replies unexpectedly', async () => {
      for (const client of [
        fakeClient({ status: 'reconnecting' }),
        fakeClient({ fail: true }),
        fakeClient({ evalReply: 'OK' }),
        fakeClient({ evalReply: [1, null] }),
      ]) {
        expect(await new CacheService(client).increment('rl:ip', 60)).toBeNull();
      }
    });
  });
});
