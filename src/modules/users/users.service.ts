import { UsersRepository, usersRepository } from './users.repository';
import { CacheService, cacheService, CACHE_KEYS, CACHE_TTL } from '../../core/cache';
import { ConflictError, NotFoundError } from '../../core/errors';
import { isUniqueViolation } from '../../database/unique-violation';
import { Transactional } from '../../database/transactional.decorator';
import {
  JsonPlaceholderService,
  jsonPlaceholderService,
  type JsonPlaceholderPost,
} from '../../integrations/jsonplaceholder';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type { CreateUserDto, UpdateUserDto } from './users.dto';
import { USER_MESSAGES, userNotFoundMessage } from './users.messages';
import type { User } from '../../database/schema';

const emailTaken = (): ConflictError =>
  new ConflictError(USER_MESSAGES.EMAIL_TAKEN, {
    details: [{ field: 'email', message: USER_MESSAGES.EMAIL_ALREADY_REGISTERED }],
  });

export class UsersService {
  constructor(
    private readonly repo: UsersRepository = usersRepository,
    private readonly cache: CacheService = cacheService,
    private readonly jsonPlaceholder: JsonPlaceholderService = jsonPlaceholderService,
  ) {}

  @Transactional()
  async createUser(dto: CreateUserDto): Promise<User> {
    if (await this.repo.findByEmail(dto.email)) throw emailTaken();

    // Hash password using Bun's native Argon2 / bcrypt implementation
    const passwordHash = await Bun.password.hash(dto.password);

    try {
      return await this.repo.create({
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        isActive: true,
      });
    } catch (error) {
      // Another request registered the same email between the check and the insert.
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  async getUserById(id: string): Promise<User> {
    const cacheKey = CACHE_KEYS.userDetail(id);

    return this.cache.getOrSet(cacheKey, CACHE_TTL.USER_DETAIL, async () => {
      const user = await this.repo.findById(id);
      if (!user) {
        throw new NotFoundError(userNotFoundMessage(id));
      }
      return user;
    });
  }

  /** Live users, newest first (stable order: created_at DESC, id DESC). */
  async listUsers(query: PaginationQueryDto): Promise<{ users: User[]; total: number }> {
    const [users, total] = await Promise.all([
      this.repo.findPage({ page: query.page, perPage: query.perPage }),
      this.repo.count(),
    ]);

    return { users, total };
  }

  @Transactional()
  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    if (dto.email !== undefined) {
      const holder = await this.repo.findByEmail(dto.email);
      if (holder && holder.id !== id) throw emailTaken();
    }

    try {
      const updated = await this.repo.updateById(id, dto);
      if (!updated) throw new NotFoundError(userNotFoundMessage(id));
      await this.cache.del(CACHE_KEYS.userDetail(id));
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  /** Soft delete: the user disappears from reads; `restoreUser` brings them back. */
  async deleteUser(id: string): Promise<void> {
    const deleted = await this.repo.softDeleteById(id);
    if (!deleted) throw new NotFoundError(userNotFoundMessage(id));
    await this.cache.del(CACHE_KEYS.userDetail(id));
  }

  async restoreUser(id: string): Promise<User> {
    try {
      const restored = await this.repo.restoreById(id);
      if (!restored) throw new NotFoundError(userNotFoundMessage(id));
      await this.cache.del(CACHE_KEYS.userDetail(id));
      return restored;
    } catch (error) {
      // A live user took the email while this one was deleted (activeUniqueIndex).
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  /**
   * Fetches external activity posts for a user from JSONPlaceholder public API.
   * Demonstrates consuming an outbound integration adapter (src/integrations/) from a domain service.
   */
  async getUserExternalPosts(userId: string): Promise<JsonPlaceholderPost[]> {
    // 1. Verify user exists in database first
    await this.getUserById(userId);

    // 2. Fetch external posts from outbound integration adapter
    return this.jsonPlaceholder.getUserPosts(1);
  }
}

export const usersService = new UsersService();
