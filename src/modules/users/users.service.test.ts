import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { UsersService } from './users.service';
import { ConflictError, NotFoundError } from '../../core/errors';
import { transactionStorage } from '../../database/transaction-host';
import type { UsersRepository } from './users.repository';
import type { CacheService } from '../../core/cache';
import type { User } from '../../database/schema';

describe('UsersService (Unit)', () => {
  const mockUser: User = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: 'hashed_password',
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
    expect(user).toEqual(mockUser);
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

  it('getUserExternalPosts should fetch user posts from jsonPlaceholder integration', async () => {
    const mockRepo: Partial<UsersRepository> = {
      findById: async () => mockUser,
    };
    const mockCache: Partial<CacheService> = {
      getOrSet: async (_key, _ttl, fetcher) => fetcher(),
    };
    const mockJsonPlaceholder = {
      getUserPosts: async () => [{ id: 1, userId: 1, title: 'Sample Post', body: 'Body' }],
    };

    const service = new UsersService(
      mockRepo as UsersRepository,
      mockCache as CacheService,
      mockJsonPlaceholder as any,
    );

    const posts = await service.getUserExternalPosts(mockUser.id);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe('Sample Post');
  });
});
