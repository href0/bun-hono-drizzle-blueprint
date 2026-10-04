import { UsersRepository, usersRepository } from './users.repository';
import { CacheService, cacheService, CACHE_KEYS, CACHE_TTL } from '../../core/cache';
import { ConflictError, NotFoundError } from '../../core/errors';
import { Transactional } from '../../database/transactional.decorator';
import {
  JsonPlaceholderService,
  jsonPlaceholderService,
  type JsonPlaceholderPost,
} from '../../integrations/jsonplaceholder';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type { CreateUserDto } from './users.dto';
import { USER_MESSAGES, userNotFoundMessage } from './users.messages';
import type { User } from '../../database/schema';

export class UsersService {
  constructor(
    private readonly repo: UsersRepository = usersRepository,
    private readonly cache: CacheService = cacheService,
    private readonly jsonPlaceholder: JsonPlaceholderService = jsonPlaceholderService,
  ) {}

  @Transactional()
  async createUser(dto: CreateUserDto): Promise<User> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(USER_MESSAGES.EMAIL_TAKEN, {
        details: [{ field: 'email', message: USER_MESSAGES.EMAIL_ALREADY_REGISTERED }],
      });
    }

    // Hash password using Bun's native Argon2 / bcrypt implementation
    const passwordHash = await Bun.password.hash(dto.password);

    const newUser = await this.repo.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      isActive: true,
    });

    return newUser;
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

  async listUsers(query: PaginationQueryDto): Promise<{ users: User[]; total: number }> {
    const offset = (query.page - 1) * query.perPage;

    const [users, total] = await Promise.all([
      this.repo.findAll(query.perPage, offset),
      this.repo.count(),
    ]);

    return { users, total };
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
