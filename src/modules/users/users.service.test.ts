import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { UsersService } from './users.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { runWithRequestContext } from '../../core/context/request-context';
import { verifyPassword } from '../../core/security/password';
import { transactionStorage } from '../../database/transaction-host';
import type { UsersRepository } from './users.repository';
import { CacheService, type CacheClient } from '../../core/cache';
import type { User } from '../../database/schema';

describe('UsersService (Unit)', () => {
  const mockUser: User = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: 'hashed_password',
    role: 'user',
    passwordChangedAt: null,
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
    isActive: true,
    createdAt: Temporal.Now.instant(),
    updatedAt: Temporal.Now.instant(),
  };

  const mockTx = { isMockTransaction: true } as any;

  it('should throw ConflictError if email already exists', async () => {
    const mockRepo: Partial<UsersRepository> = {
      findByEmail: async () => mockUser,
    };
    const mockCache: Partial<CacheService> = {};

    const service = new UsersService(mockRepo as UsersRepository, mockCache as CacheService);

    await transactionStorage.run(mockTx, async () => {
      expect(
        service.createUser({
          email: 'test@example.com',
          fullName: 'Test User',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  it('should successfully create a new user when email is not taken', async () => {
    const mockRepo: Partial<UsersRepository> = {
      findByEmail: async () => null,
      create: async () => mockUser,
    };
    const mockCache: Partial<CacheService> = {};

    const service = new UsersService(mockRepo as UsersRepository, mockCache as CacheService);

    await transactionStorage.run(mockTx, async () => {
      const created = await service.createUser({
        email: 'test@example.com',
        fullName: 'Test User',
        password: 'password123',
      });

      expect(created).toBeDefined();
      expect(created.email).toBe('test@example.com');
      expect(created.fullName).toBe('Test User');
    });
  });

  it('should throw NotFoundError if user ID does not exist', async () => {
    const mockRepo: Partial<UsersRepository> = {
      findById: async () => null,
    };
    const mockCache: Partial<CacheService> = {
      getOrSet: async (_key, _ttl, fetcher) => fetcher(),
    };

    const service = new UsersService(mockRepo as UsersRepository, mockCache as CacheService);

    expect(service.getUserById('non-existent-id')).rejects.toThrow(NotFoundError);
  });

  it('should return user from getUserById when user exists', async () => {
    const mockRepo: Partial<UsersRepository> = {
      findById: async () => mockUser,
    };
    const mockCache: Partial<CacheService> = {
      getOrSet: async (_key, _ttl, fetcher) => fetcher(),
    };

    const service = new UsersService(mockRepo as UsersRepository, mockCache as CacheService);
    const user = await service.getUserById(mockUser.id);
    // toEqual treats an undefined property as absent: the public user is the user minus the hash.
    expect(user as unknown).toEqual({
      ...mockUser,
      passwordHash: undefined,
      passwordChangedAt: undefined,
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('getUserById: a cache hit equals the miss (Temporal revived), and no password hash is cached', async () => {
    const store = new Map<string, string>();
    const client = {
      status: 'ready',
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      },
    } as unknown as CacheClient;
    const user = {
      ...mockUser,
      createdAt: Temporal.Instant.from('2026-10-10T03:05:24.434195Z'),
      updatedAt: Temporal.Instant.from('2026-10-10T03:05:24Z'),
    };
    let fetches = 0;
    const repo = {
      findById: async () => {
        fetches += 1;
        return user;
      },
    } as unknown as UsersRepository;
    const service = new UsersService(repo, new CacheService(client));

    const miss = await service.getUserById(user.id);
    const hit = await service.getUserById(user.id);

    expect(fetches).toBe(1);
    expect(hit).toEqual(miss);
    expect(hit.createdAt).toBeInstanceOf(Temporal.Instant);
    expect([...store.values()].join()).not.toContain(user.passwordHash);
  });

  it('getUserById: a malformed cached entry is a miss', async () => {
    const client = {
      status: 'ready',
      get: async () => JSON.stringify({ id: mockUser.id, createdAt: 'not-a-date' }),
      set: async () => 'OK',
    } as unknown as CacheClient;
    const service = new UsersService(
      { findById: async () => mockUser } as unknown as UsersRepository,
      new CacheService(client),
    );

    expect((await service.getUserById(mockUser.id)).email).toBe(mockUser.email);
  });

  it('should list users with pagination count', async () => {
    let pageQuery: unknown;
    const mockRepo: Partial<UsersRepository> = {
      findPage: async (query) => {
        pageQuery = query;
        return [mockUser];
      },
      count: async () => 1,
    };
    const mockCache: Partial<CacheService> = {};

    const service = new UsersService(mockRepo as UsersRepository, mockCache as CacheService);
    const result = await service.listUsers({ page: 2, perPage: 10 });
    expect(result.users).toEqual([mockUser]);
    expect(result.total).toBe(1);
    expect(pageQuery).toEqual({ page: 2, perPage: 10 });
  });

  const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
  const cacheSpy = (): { cache: CacheService; deleted: string[] } => {
    const deleted: string[] = [];
    const cache = {
      del: async (key: string) => {
        deleted.push(key);
      },
    } as unknown as CacheService;
    return { cache, deleted };
  };

  it('createUser maps a concurrent duplicate email (unique violation) to ConflictError', async () => {
    const mockRepo: Partial<UsersRepository> = {
      findByEmail: async () => null,
      create: async () => Promise.reject(uniqueViolation),
    };
    const service = new UsersService(mockRepo as UsersRepository, {} as CacheService);

    await transactionStorage.run(mockTx, async () => {
      expect(
        service.createUser({ email: 'a@b.c', fullName: 'A', password: 'password123' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  it('createUser rethrows other database errors', async () => {
    const failure = new Error('connection lost');
    const mockRepo: Partial<UsersRepository> = {
      findByEmail: async () => null,
      create: async () => Promise.reject(failure),
    };
    const service = new UsersService(mockRepo as UsersRepository, {} as CacheService);

    await transactionStorage.run(mockTx, async () => {
      expect(
        service.createUser({ email: 'a@b.c', fullName: 'A', password: 'password123' }),
      ).rejects.toBe(failure);
    });
  });

  describe('updateUser', () => {
    it('updates, evicts the cached detail and returns the user', async () => {
      const { cache, deleted } = cacheSpy();
      const updated = { ...mockUser, fullName: 'New' };
      const mockRepo: Partial<UsersRepository> = { updateById: async () => updated };
      const service = new UsersService(mockRepo as UsersRepository, cache);

      await transactionStorage.run(mockTx, async () => {
        expect(await service.updateUser(mockUser.id, { fullName: 'New' })).toEqual(updated);
      });
      expect(deleted).toEqual(['user:detail:' + mockUser.id]);
    });

    it('rejects an email held by another live user, allows keeping its own', async () => {
      const other = { ...mockUser, id: '0192f1d0-0000-7000-8000-000000000099' };
      const mockRepo: Partial<UsersRepository> = {
        findByEmail: async () => other,
        updateById: async () => mockUser,
      };
      const service = new UsersService(mockRepo as UsersRepository, cacheSpy().cache);

      await transactionStorage.run(mockTx, async () => {
        expect(service.updateUser(mockUser.id, { email: other.email })).rejects.toThrow(
          ConflictError,
        );
        expect(await service.updateUser(other.id, { email: other.email })).toEqual(mockUser);
      });
    });

    it('NotFoundError for a missing or deleted user; unique violation → ConflictError', async () => {
      const service = new UsersService(
        { updateById: async () => null } as unknown as UsersRepository,
        cacheSpy().cache,
      );
      const racing = new UsersService(
        {
          findByEmail: async () => null,
          updateById: async () => Promise.reject(uniqueViolation),
        } as unknown as UsersRepository,
        cacheSpy().cache,
      );

      await transactionStorage.run(mockTx, async () => {
        expect(service.updateUser(mockUser.id, { fullName: 'x' })).rejects.toThrow(NotFoundError);
        expect(racing.updateUser(mockUser.id, { email: 'x@y.z' })).rejects.toThrow(ConflictError);
      });
    });
  });

  describe('deleteUser / restoreUser', () => {
    it('soft-deletes and evicts the cached detail; NotFoundError when nothing to delete', async () => {
      const { cache, deleted } = cacheSpy();
      const service = new UsersService(
        { softDeleteById: async () => mockUser } as unknown as UsersRepository,
        cache,
      );
      const missing = new UsersService(
        { softDeleteById: async () => null } as unknown as UsersRepository,
        cache,
      );

      await service.deleteUser(mockUser.id);
      expect(deleted).toEqual(['user:detail:' + mockUser.id]);
      expect(missing.deleteUser(mockUser.id)).rejects.toThrow(NotFoundError);
    });

    it('restores and evicts the cached detail; NotFoundError when not deleted', async () => {
      const { cache, deleted } = cacheSpy();
      const service = new UsersService(
        { restoreById: async () => mockUser } as unknown as UsersRepository,
        cache,
      );
      const missing = new UsersService(
        { restoreById: async () => null } as unknown as UsersRepository,
        cache,
      );

      expect(await service.restoreUser(mockUser.id)).toEqual(mockUser);
      expect(deleted).toEqual(['user:detail:' + mockUser.id]);
      expect(missing.restoreUser(mockUser.id)).rejects.toThrow(NotFoundError);
    });

    it('restore maps a taken email (activeUniqueIndex) to ConflictError and rethrows others', async () => {
      const failure = new Error('connection lost');
      const taken = new UsersService(
        { restoreById: async () => Promise.reject(uniqueViolation) } as unknown as UsersRepository,
        cacheSpy().cache,
      );
      const broken = new UsersService(
        { restoreById: async () => Promise.reject(failure) } as unknown as UsersRepository,
        cacheSpy().cache,
      );

      expect(taken.restoreUser(mockUser.id)).rejects.toThrow(ConflictError);
      expect(broken.restoreUser(mockUser.id)).rejects.toBe(failure);
    });
  });
});

describe('UsersService password reset and self-lockout', () => {
  const user: User = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: 'old-hash',
    role: 'admin',
    passwordChangedAt: null,
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
    isActive: true,
    createdAt: Temporal.Instant.from('2026-10-01T00:00:00Z'),
    updatedAt: Temporal.Instant.from('2026-10-01T00:00:00Z'),
  };
  const deleted: string[] = [];
  const cache = {
    del: async (key: string) => {
      deleted.push(key);
    },
  } as unknown as CacheService;
  const asActor = <T>(actor: `user:${string}`, fn: () => Promise<T>): Promise<T> =>
    runWithRequestContext({ requestId: 'r', locale: 'en', clientIp: '127.0.0.1', actor }, fn);

  it('setPassword stores a new hash with password_changed_at and evicts the cached detail', async () => {
    const patches: Record<string, unknown>[] = [];
    const repo: Partial<UsersRepository> = {
      updateById: async (_id, patch) => {
        patches.push(patch);
        return user;
      },
    };
    const service = new UsersService(repo as UsersRepository, cache);

    await service.setPassword(user.id, { password: 'new password 1' });

    expect(await verifyPassword('new password 1', String(patches[0]?.passwordHash))).toBe(true);
    expect(patches[0]?.passwordChangedAt).toBeInstanceOf(Temporal.Instant);
    expect(deleted).toContain(`user:detail:${user.id}`);
  });

  it('setPassword of an unknown user is a 404', async () => {
    const service = new UsersService(
      { updateById: async () => null } as unknown as UsersRepository,
      cache,
    );

    expect(service.setPassword(user.id, { password: 'new password 1' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('an admin cannot delete, deactivate or demote themselves; other admins can', async () => {
    const repo: Partial<UsersRepository> = {
      softDeleteById: async () => user,
      updateById: async () => user,
      findByEmail: async () => null,
    };
    const service = new UsersService(repo as UsersRepository, cache);
    const self = `user:${user.id}` as const;

    expect(asActor(self, () => service.deleteUser(user.id))).rejects.toThrow(ForbiddenError);
    await transactionStorage.run({} as never, async () => {
      expect(asActor(self, () => service.updateUser(user.id, { isActive: false }))).rejects.toThrow(
        ForbiddenError,
      );
      expect(asActor(self, () => service.updateUser(user.id, { role: 'user' }))).rejects.toThrow(
        ForbiddenError,
      );
      // Harmless changes of one's own account are fine.
      expect(
        await asActor(self, () =>
          service.updateUser(user.id, { fullName: 'Renamed', role: 'admin' }),
        ),
      ).toBe(user);
      expect(
        await asActor('user:another-admin', () => service.updateUser(user.id, { isActive: false })),
      ).toBe(user);
    });
    await asActor('user:another-admin', () => service.deleteUser(user.id));
  });
});
