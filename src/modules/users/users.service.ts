import { z } from 'zod';
import { UsersRepository, usersRepository } from './users.repository';
import { UsersRolesRepository, usersRolesRepository } from './users-roles.repository';
import { CacheService, cacheService, CACHE_KEYS, CACHE_TTL } from '../../core/cache';
import { instantField } from '../../core/dto/datetime.dto';
import { getActor } from '../../core/context/request-context';
import { APP_ERROR_CODES, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors';
import { requireMayManageUser } from '../../core/security/account-access';
import { hashPassword } from '../../core/security/password';
import type { EffectivePermissions } from '../../core/security/rbac';
import { DefaultRoleRepository, defaultRoleRepository } from '../../database/rbac/default-role';
import { SuperAdminsRepository, superAdminsRepository } from '../../database/rbac/super-admins';
import { isUniqueViolation } from '../../database/unique-violation';
import { afterCommit, Transactional } from '../../database/transactional.decorator';
import type {
  CreateUserDto,
  PublicUser,
  SetPasswordDto,
  UpdateUserDto,
  UserListQueryDto,
  UserWithRoles,
} from './users.dto';
import { nowInstant } from '../../utils/datetime.util';
import { USER_MESSAGES, userNotFoundMessage } from './users.messages';
import type { User } from '../../database/schema';

const toPublicUser = ({
  passwordHash: _passwordHash,
  passwordChangedAt: _passwordChangedAt,
  ...user
}: PublicUser & Partial<Pick<User, 'passwordHash' | 'passwordChangedAt'>>): PublicUser => user;

/**
 * An admin may not lock themselves out: delete or deactivate their own account (another admin can;
 * the last-resort recovery is `bun run seed:admin --promote`). Removing their own roles is the RBAC
 * API's concern.
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
    private readonly userRoles: UsersRolesRepository = usersRolesRepository,
    /** Gives a new user the system role `user` (D59). */
    private readonly defaultRole: DefaultRoleRepository = defaultRoleRepository,
    /** The last active super admin is never deleted or deactivated (anti-lockout, D52). */
    private readonly superAdmins: SuperAdminsRepository = superAdminsRepository,
  ) {}

  /** `target` is a super admin and no other live, active super admin would remain → 409. */
  private async forbidLastSuperAdmin(
    id: string,
    target: EffectivePermissions | undefined,
  ): Promise<void> {
    if (!target?.superAdmin) return;
    if ((await this.superAdmins.lockOtherActiveHolders(id)).length === 0) {
      throw new ConflictError(USER_MESSAGES.LAST_SUPER_ADMIN);
    }
  }

  /** Adds each user's live role keys (one query for the whole list). */
  private async withRoles(list: readonly PublicUser[]): Promise<UserWithRoles[]> {
    const keys = await this.userRoles.findRoleKeys(list.map((user) => user.id));
    return list.map((user) => ({ ...toPublicUser(user), roles: keys.get(user.id) ?? [] }));
  }

  private async oneWithRoles(user: PublicUser): Promise<UserWithRoles> {
    const [withRoles] = await this.withRoles([user]);
    return withRoles;
  }

  /** A new user starts with the system role `user` (D59) — in the same transaction. */
  @Transactional()
  async createUser(dto: CreateUserDto): Promise<UserWithRoles> {
    if (await this.repo.findByEmail(dto.email)) throw emailTaken();

    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.repo.create({
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        isActive: true,
      });
      await this.defaultRole.assign(user.id);
      return await this.oneWithRoles(user);
    } catch (error) {
      // Another request registered the same email between the check and the insert.
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  /**
   * Cached without the password hash; a hit is revived to the same types as a miss. The roles are
   * read fresh: they change through the RBAC API, which knows nothing of this cache.
   */
  async getUserById(id: string): Promise<UserWithRoles> {
    const cacheKey = CACHE_KEYS.userDetail(id);

    const user = await this.cache.getOrSet(
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
    return this.oneWithRoles(user);
  }

  /** Live users matching the query; newest first unless `sort` says otherwise (D41). */
  async listUsers(query: UserListQueryDto): Promise<{ users: UserWithRoles[]; total: number }> {
    const { rows, total } = await this.repo.findUserList(query);
    return { users: await this.withRoles(rows), total };
  }

  /**
   * Changes another user's account only for a caller holding what that user holds (no way round
   * RBAC, `requireMayManageUser`); deactivating the last active super admin is refused.
   */
  @Transactional()
  async updateUser(id: string, dto: UpdateUserDto): Promise<UserWithRoles> {
    const target = await requireMayManageUser(id);
    if (dto.isActive === false) {
      forbidSelfLockout(id);
      await this.forbidLastSuperAdmin(id, target);
    }
    if (dto.email !== undefined) {
      const holder = await this.repo.findByEmail(dto.email);
      if (holder && holder.id !== id) throw emailTaken();
    }

    try {
      const updated = await this.repo.updateById(id, dto);
      if (!updated) throw new NotFoundError(userNotFoundMessage(id));
      await afterCommit(() => this.cache.del(CACHE_KEYS.userDetail(id)));
      return await this.oneWithRoles(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  /** Soft delete: the user disappears from reads; `restoreUser` brings them back. */
  @Transactional()
  async deleteUser(id: string): Promise<void> {
    const target = await requireMayManageUser(id);
    forbidSelfLockout(id);
    await this.forbidLastSuperAdmin(id, target);
    const deleted = await this.repo.softDeleteById(id);
    if (!deleted) throw new NotFoundError(userNotFoundMessage(id));
    await afterCommit(() => this.cache.del(CACHE_KEYS.userDetail(id)));
  }

  /**
   * Admin reset of a user's password. `password_changed_at` makes the refresh endpoint refuse every
   * token family started before now, so all of the user's sessions end.
   */
  async setPassword(id: string, dto: SetPasswordDto): Promise<void> {
    await requireMayManageUser(id);
    const passwordHash = await hashPassword(dto.password);
    const updated = await this.repo.updateById(id, {
      passwordHash,
      passwordChangedAt: nowInstant(),
    });
    if (!updated) throw new NotFoundError(userNotFoundMessage(id));
    await afterCommit(() => this.cache.del(CACHE_KEYS.userDetail(id)));
  }

  /** Restoring gives the user back what they held: only for a caller holding it too. */
  async restoreUser(id: string): Promise<UserWithRoles> {
    await requireMayManageUser(id);
    try {
      const restored = await this.repo.restoreById(id);
      if (!restored) throw new NotFoundError(userNotFoundMessage(id));
      await afterCommit(() => this.cache.del(CACHE_KEYS.userDetail(id)));
      return await this.oneWithRoles(restored);
    } catch (error) {
      // A live user took the email while this one was deleted (activeUniqueIndex).
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }
}

export const usersService = new UsersService();
