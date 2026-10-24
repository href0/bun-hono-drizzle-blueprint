import { z } from 'zod';
import { UsersRepository, usersRepository } from './users.repository';
import { CacheService, cacheService, CACHE_KEYS, CACHE_TTL } from '../../core/cache';
import { instantField } from '../../core/dto/datetime.dto';
import { getActor } from '../../core/context/request-context';
import { APP_ERROR_CODES, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { hashPassword } from '../../core/security/password';
import { isUniqueViolation } from '../../database/unique-violation';
import { Transactional } from '../../database/transactional.decorator';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type { CreateUserDto, PublicUser, SetPasswordDto, UpdateUserDto } from './users.dto';
import { nowInstant } from '../../utils/datetime.util';
import { USER_MESSAGES, userNotFoundMessage } from './users.messages';
import type { User } from '../../database/schema';

const toPublicUser = ({
  passwordHash: _passwordHash,
  passwordChangedAt: _passwordChangedAt,
  ...user
}: User): PublicUser => user;

/**
 * An admin may not lock themselves out: delete, deactivate or demote their own account (another
 * admin can; the last-resort recovery is `bun run seed:admin --promote`).
 */
const forbidSelfLockout = (id: string): void => {
  if (getActor() === `user:${id}`) {
    throw new ForbiddenError(USER_MESSAGES.SELF_LOCKOUT, {
      code: APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN,
    });
  }
};

/**
 * Cached users are JSON: instants come back as ISO strings. Parsing them back keeps a cache hit
 * identical to a miss (types and the millisecond wire format); a malformed entry is a miss.
 */
const cachedUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  createdAt: instantField,
  updatedAt: instantField,
  createdBy: z.string(),
  updatedBy: z.string(),
  deletedAt: instantField.nullable(),
});

const reviveCachedUser = (raw: unknown): PublicUser => cachedUserSchema.parse(raw);

const emailTaken = (): ConflictError =>
  new ConflictError(USER_MESSAGES.EMAIL_TAKEN, {
    details: [{ field: 'email', message: USER_MESSAGES.EMAIL_ALREADY_REGISTERED }],
  });

export class UsersService {
  constructor(
    private readonly repo: UsersRepository = usersRepository,
    private readonly cache: CacheService = cacheService,
  ) {}

  @Transactional()
  async createUser(dto: CreateUserDto): Promise<User> {
    if (await this.repo.findByEmail(dto.email)) throw emailTaken();

    const passwordHash = await hashPassword(dto.password);

    try {
      return await this.repo.create({
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        ...(dto.role === undefined ? {} : { role: dto.role }),
        isActive: true,
      });
    } catch (error) {
      // Another request registered the same email between the check and the insert.
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  /** Cached without the password hash; a hit is revived to the same types as a miss. */
  async getUserById(id: string): Promise<PublicUser> {
    const cacheKey = CACHE_KEYS.userDetail(id);

    return this.cache.getOrSet(
      cacheKey,
      CACHE_TTL.USER_DETAIL,
      async () => {
        const user = await this.repo.findById(id);
        if (!user) {
          throw new NotFoundError(userNotFoundMessage(id));
        }
        return toPublicUser(user);
      },
      { revive: reviveCachedUser },
    );
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
    if (dto.isActive === false || (dto.role !== undefined && dto.role !== 'admin')) {
      forbidSelfLockout(id);
    }
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
    forbidSelfLockout(id);
    const deleted = await this.repo.softDeleteById(id);
    if (!deleted) throw new NotFoundError(userNotFoundMessage(id));
    await this.cache.del(CACHE_KEYS.userDetail(id));
  }

  /**
   * Admin reset of a user's password. `password_changed_at` makes the refresh endpoint refuse every
   * token family started before now, so all of the user's sessions end (plan Review 8).
   */
  async setPassword(id: string, dto: SetPasswordDto): Promise<void> {
    const passwordHash = await hashPassword(dto.password);
    const updated = await this.repo.updateById(id, {
      passwordHash,
      passwordChangedAt: nowInstant(),
    });
    if (!updated) throw new NotFoundError(userNotFoundMessage(id));
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
}

export const usersService = new UsersService();
