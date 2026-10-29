import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { CACHE_KEYS, CACHE_TTL, type CacheService } from '../../core/cache';
import { ConflictError, NotFoundError } from '../../core/errors';
import { hashPartnerApiKey } from '../../core/security/partner-credentials';
import type { NewPartnerCredential, PartnerCredential } from '../../database/schema';
import { createSecretCipher } from '../../utils/secret-cipher.util';
import type { PartnerCredentialsRepository } from './partner-credentials.repository';
import { PartnerCredentialsService } from './partner-credentials.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const cipher = createSecretCipher({ activeKeyId: 'k1', keys: { k1: 'c'.repeat(64) } });

const stored: PartnerCredential = {
  id: ID,
  partnerCode: 'acme',
  partnerName: 'Acme Corp',
  apiKeyHash: 'a'.repeat(64),
  apiKeyPrefix: 'pk_abcdefgh',
  encryptedSecret: cipher.encrypt('old-secret'),
  ipWhitelist: [],
  allowedRoutes: ['/*'],
  rateLimitRpm: 60,
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

type Patch = Partial<NewPartnerCredential>;

/** A repository fake that records writes; `null` from a method = row missing / deleted. */
const fakeRepo = (overrides: Partial<PartnerCredentialsRepository> = {}) => {
  const writes: { created: Patch[]; updated: Patch[] } = { created: [], updated: [] };
  const repo: Partial<PartnerCredentialsRepository> = {
    create: async (values: Patch) => {
      writes.created.push(values);
      return { ...stored, ...values };
    },
    findById: async (id: string) => (id === ID ? stored : null),
    findCredentialList: async () => ({ rows: [stored], total: 1 }),
    updateById: async (id: string, patch: Patch) => {
      writes.updated.push(patch);
      return id === ID ? { ...stored, ...patch } : null;
    },
    softDeleteById: async (id: string) => (id === ID ? stored : null),
    restoreById: async (id: string) => (id === ID ? stored : null),
    ...overrides,
  };
  return {
    service: new PartnerCredentialsService(repo as PartnerCredentialsRepository, cipher),
    writes,
  };
};

const MISSING = '0192f1d0-0000-7000-8000-000000000000';

/** The rejection of `promise` (undefined if it resolves). */
const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

describe('PartnerCredentialsService (Unit)', () => {
  const dto = {
    partnerCode: 'acme',
    partnerName: 'Acme Corp',
    ipWhitelist: [],
    allowedRoutes: ['/*'],
    rateLimitRpm: 60,
  };

  it('creates a credential: returns key + secret once, stores only hash, prefix and ciphertext', async () => {
    const { service, writes } = fakeRepo();

    const issued = await service.createCredential(dto);
    const written = writes.created.at(0);

    expect(issued.apiKey).toMatch(/^pk_/);
    expect(written).toMatchObject({ ...dto, isActive: true });
    expect(written?.apiKeyHash).toBe(hashPartnerApiKey(issued.apiKey));
    expect(written?.apiKeyPrefix).toBe(issued.apiKey.slice(0, 11));
    expect(cipher.decrypt(written?.encryptedSecret ?? '')).toBe(issued.secret);
    expect(JSON.stringify(written)).not.toContain(issued.apiKey);
    expect(JSON.stringify(written)).not.toContain(issued.secret);
  });

  it('maps a unique violation on create (code used before, even if deleted) to 409', async () => {
    const duplicate = Object.assign(new Error('duplicate key'), { code: '23505' });
    const { service } = fakeRepo({
      create: async () => {
        throw duplicate;
      },
    });

    expect(await rejectionOf(service.createCredential(dto))).toBeInstanceOf(ConflictError);
  });

  it('rethrows other create failures untouched', async () => {
    const failure = new Error('connection lost');
    const { service } = fakeRepo({
      create: async () => {
        throw failure;
      },
    });

    expect(await rejectionOf(service.createCredential(dto))).toBe(failure);
  });

  it('gets, lists, updates, deletes and restores; a missing id is 404 everywhere', async () => {
    const { service, writes } = fakeRepo();

    expect(await service.getCredentialById(ID)).toBe(stored);
    expect(await service.listCredentials({ page: 1, perPage: 10 })).toEqual({
      credentials: [stored],
      total: 1,
    });
    expect((await service.updateCredential(ID, { partnerName: 'Acme' })).partnerName).toBe('Acme');
    expect(writes.updated.at(-1)).toEqual({ partnerName: 'Acme' });
    await service.deleteCredential(ID);
    expect(await service.restoreCredential(ID)).toBe(stored);

    for (const call of [
      () => service.getCredentialById(MISSING),
      () => service.updateCredential(MISSING, { rateLimitRpm: 5 }),
      () => service.setActive(MISSING, false),
      () => service.rotateSecret(MISSING),
      () => service.rotateApiKey(MISSING),
      () => service.deleteCredential(MISSING),
      () => service.restoreCredential(MISSING),
    ]) {
      expect(await rejectionOf(call())).toBeInstanceOf(NotFoundError);
    }
  });

  it('activates and deactivates through an audited update', async () => {
    const { service, writes } = fakeRepo();

    expect((await service.setActive(ID, false)).isActive).toBe(false);
    expect(writes.updated.at(-1)).toEqual({ isActive: false });
    expect((await service.setActive(ID, true)).isActive).toBe(true);
    expect(writes.updated.at(-1)).toEqual({ isActive: true });
  });

  it('rotates the secret: a new one, encrypted with the active key, returned once', async () => {
    const { service, writes } = fakeRepo();

    const { secret, credential } = await service.rotateSecret(ID);

    expect(secret).not.toBe('old-secret');
    expect(Object.keys(writes.updated.at(-1) ?? {})).toEqual(['encryptedSecret']);
    expect(cipher.decrypt(credential.encryptedSecret)).toBe(secret);
  });

  it('rotates the API key: a new hash and prefix, the key returned once', async () => {
    const { service, writes } = fakeRepo();

    const { apiKey, credential } = await service.rotateApiKey(ID);

    expect(writes.updated.at(-1)).toEqual({
      apiKeyHash: hashPartnerApiKey(apiKey),
      apiKeyPrefix: apiKey.slice(0, 11),
    });
    expect(credential.apiKeyHash).not.toBe(stored.apiKeyHash);
  });
});

describe('PartnerCredentialsService — gateway lookup cache', () => {
  /** Records cache traffic; `getOrSet` always misses (the CacheService itself is tested elsewhere). */
  const recordingCache = () => {
    const calls: { getOrSet: { key: string; ttl: number; negativeTtl?: number }[]; del: string[] } =
      { getOrSet: [], del: [] };
    const cache = {
      getOrSet: async <T>(
        key: string,
        ttl: number,
        fetcher: () => Promise<T>,
        options: { negativeTtl?: number; revive?: (raw: unknown) => T } = {},
      ): Promise<T> => {
        calls.getOrSet.push({ key, ttl, negativeTtl: options.negativeTtl });
        const value: unknown = await fetcher();
        // Round-trip like Redis JSON, then revive.
        if (value === null || !options.revive) return value as T;
        return options.revive(JSON.parse(JSON.stringify(value)));
      },
      del: async (key: string) => {
        calls.del.push(key);
      },
    };
    return { cache: cache as unknown as CacheService, calls };
  };

  const serviceWith = (overrides: Partial<PartnerCredentialsRepository> = {}) => {
    const { cache, calls } = recordingCache();
    const repo: Partial<PartnerCredentialsRepository> = {
      findByApiKeyHash: async (hash) => (hash === stored.apiKeyHash ? stored : null),
      findById: async () => stored,
      create: async (values) => ({ ...stored, ...values }),
      updateById: async (_id, patch) => ({ ...stored, ...patch }),
      softDeleteById: async () => stored,
      restoreById: async () => stored,
      ...overrides,
    };
    return {
      service: new PartnerCredentialsService(repo as PartnerCredentialsRepository, cipher, cache),
      calls,
    };
  };
  const keyOf = (hash: string): string => CACHE_KEYS.partnerCredential(hash);

  it('returns the gateway view of a live credential, cached, unknown keys negatively cached', async () => {
    const { service, calls } = serviceWith();

    expect(await service.findForGateway(stored.apiKeyHash)).toEqual({
      partnerCode: stored.partnerCode,
      encryptedSecret: stored.encryptedSecret,
      ipWhitelist: stored.ipWhitelist,
      allowedRoutes: stored.allowedRoutes,
      rateLimitRpm: stored.rateLimitRpm,
      isActive: stored.isActive,
    });
    expect(await service.findForGateway('f'.repeat(64))).toBeNull();
    expect(calls.getOrSet).toEqual([
      {
        key: keyOf(stored.apiKeyHash),
        ttl: CACHE_TTL.PARTNER_CREDENTIAL,
        negativeTtl: CACHE_TTL.PARTNER_CREDENTIAL_MISS,
      },
      {
        key: keyOf('f'.repeat(64)),
        ttl: CACHE_TTL.PARTNER_CREDENTIAL,
        negativeTtl: CACHE_TTL.PARTNER_CREDENTIAL_MISS,
      },
    ]);
  });

  it('drops the cached view on every change, the old key hash on an API key rotation', async () => {
    const { service, calls } = serviceWith();

    await service.updateCredential(ID, { rateLimitRpm: 1 });
    await service.setActive(ID, false);
    await service.rotateSecret(ID);
    await service.deleteCredential(ID);
    await service.restoreCredential(ID);
    expect(calls.del).toEqual(Array.from({ length: 5 }, () => keyOf(stored.apiKeyHash)));

    calls.del.length = 0;
    const { apiKey } = await service.rotateApiKey(ID);
    // The new hash (written) and the old one (must stop matching at once).
    expect(calls.del).toEqual([keyOf(hashPartnerApiKey(apiKey)), keyOf(stored.apiKeyHash)]);

    calls.del.length = 0;
    const issued = await service.createCredential({
      partnerCode: 'new',
      partnerName: 'New',
      ipWhitelist: [],
      allowedRoutes: ['/*'],
      rateLimitRpm: 60,
    });
    expect(calls.del).toEqual([keyOf(hashPartnerApiKey(issued.apiKey))]);
  });

  it('revives only well-formed cached entries (a malformed one is a miss)', async () => {
    let revive: ((raw: unknown) => unknown) | undefined;
    const cache = {
      getOrSet: async <T>(
        _key: string,
        _ttl: number,
        fetcher: () => Promise<T>,
        options: { revive?: (raw: unknown) => unknown } = {},
      ): Promise<T> => {
        revive = options.revive;
        return fetcher();
      },
    } as unknown as CacheService;
    const repo = {
      findByApiKeyHash: async () => stored,
    } as unknown as PartnerCredentialsRepository;
    const service = new PartnerCredentialsService(repo, cipher, cache);

    const view = await service.findForGateway(stored.apiKeyHash);
    expect(revive?.(JSON.parse(JSON.stringify(view)))).toEqual(view);
    expect(() => revive?.({ partnerCode: 'acme' })).toThrow();
  });
});
