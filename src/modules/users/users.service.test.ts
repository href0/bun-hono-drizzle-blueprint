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
    const mockRepo: Partial<UsersRepository> = {
      findAll: async () => [mockUser],
      count: async () => 1,
    };
    const mockCache: Partial<CacheService> = {};

    const service = new UsersService(mockRepo as UsersRepository, mockCache as CacheService);
    const result = await service.listUsers({ page: 1, perPage: 10 });
    expect(result.users).toEqual([mockUser]);
    expect(result.total).toBe(1);
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
