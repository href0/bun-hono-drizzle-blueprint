import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { authConfig } from '../../config';
import { CacheService, cacheService, CACHE_KEYS } from '../../core/cache';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors';
import { SUPER_ADMIN_ROLE } from '../../core/security/rbac';
import { afterCommit, Transactional } from '../../database/transactional.decorator';
import { isUniqueViolation } from '../../database/unique-violation';
import type { Role, RolePermission, UserPermission, UserRole } from '../../database/schema';
import { nowInstant } from '../../utils/datetime.util';
import {
  RbacPermissionsRepository,
  rbacPermissionsRepository,
} from './rbac-permissions.repository';
import {
  RbacRolePermissionsRepository,
  rbacRolePermissionsRepository,
} from './rbac-role-permissions.repository';
import { RbacRolesRepository, rbacRolesRepository } from './rbac-roles.repository';
import {
  RbacUserPermissionsRepository,
  rbacUserPermissionsRepository,
  type ActiveGrant,
} from './rbac-user-permissions.repository';
import { RbacUserRolesRepository, rbacUserRolesRepository } from './rbac-user-roles.repository';
import {
  RBAC_MESSAGES,
  rbacPermissionNotFoundMessage,
  rbacPermissionNotGrantedMessage,
  rbacPermissionNotMappedMessage,
  rbacRoleNotAssignedMessage,
  rbacRoleNotFoundMessage,
  rbacUserNotFoundMessage,
} from './rbac.messages';

/**
 * What a user may do (D52). `superAdmin`: every permission that is not retired — the list is not
 * stored, so permissions added by a later sync count at once; otherwise the keys of every live role
 * ∪ the user's own grants that have not expired.
 */
export interface EffectivePermissions {
  superAdmin: boolean;
  permissions: string[];
}

export interface GrantPermissionInput {
  /** `null` / absent = no end. Must lie in the future. */
  expiresAt?: Temporal.Instant | null;
  note?: string | null;
}

const cachedPermissionsSchema = z.object({
  superAdmin: z.boolean(),
  permissions: z.array(z.string()),
});

/** Cache entries dropped at once after a role change (one DEL each, fail-open). */
const INVALIDATION_BATCH = 100;

/**
 * RBAC (plan RBAC step 3): the effective permissions of a user, cached per user (D53), and every
 * change of roles, role mappings and per-user grants. Writes run in one transaction through the
 * base repositories (audited in `record_changes`); the cached permissions of every affected user
 * are dropped after the outermost commit (`afterCommit`, D63), so a concurrent read cannot cache
 * the old state again. Redis down: reads go to the database, a missed drop is bounded by
 * `RBAC_PERMISSION_CACHE_TTL_SECONDS`.
 */
export class RbacService {
  constructor(
    private readonly rolesRepo: RbacRolesRepository = rbacRolesRepository,
    private readonly permissionsRepo: RbacPermissionsRepository = rbacPermissionsRepository,
    private readonly rolePermissionsRepo: RbacRolePermissionsRepository = rbacRolePermissionsRepository,
    private readonly userRolesRepo: RbacUserRolesRepository = rbacUserRolesRepository,
    private readonly userPermissionsRepo: RbacUserPermissionsRepository = rbacUserPermissionsRepository,
    private readonly cache: CacheService = cacheService,
    private readonly ttlSeconds: number = authConfig.RBAC_PERMISSION_CACHE_TTL_SECONDS,
  ) {}

  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const key = CACHE_KEYS.userPermissions(userId);
    const cached = cachedPermissionsSchema.safeParse(await this.cache.get<unknown>(key));
    if (cached.success) return cached.data;

    const roleKeys = await this.userRolesRepo.findRoleKeys(userId);
    const superAdmin = roleKeys.includes(SUPER_ADMIN_ROLE);
    let grants: ActiveGrant[] = [];
    let permissions: string[] = [];
    if (!superAdmin) {
      grants = await this.userPermissionsRepo.findActiveGrants(userId);
      const fromRoles = await this.userRolesRepo.findRolePermissionKeys(userId);
      permissions = [...new Set([...fromRoles, ...grants.map((grant) => grant.key)])].sort();
    }
    const effective: EffectivePermissions = { superAdmin, permissions };
    await this.cache.set(key, effective, this.cacheTtl(grants));
    return effective;
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId);
    return effective.superAdmin || effective.permissions.includes(permission);
  }

  @Transactional()
  async assignRole(userId: string, roleId: string): Promise<UserRole> {
    await this.requireLiveUser(userId);
    await this.requireRole(roleId);
    if (await this.userRolesRepo.findLive(userId, roleId)) {
      throw new ConflictError(RBAC_MESSAGES.ROLE_ALREADY_ASSIGNED);
    }
    const assigned = await this.createUnique(
      () => this.userRolesRepo.create({ userId, roleId }),
      RBAC_MESSAGES.ROLE_ALREADY_ASSIGNED,
    );
    await this.forget([userId]);
    return assigned;
  }

  /** Soft delete = revocation (D55), audited. */
  @Transactional()
  async revokeRole(userId: string, roleId: string): Promise<void> {
    const assignment = await this.userRolesRepo.findLive(userId, roleId);
    if (!assignment) throw new NotFoundError(rbacRoleNotAssignedMessage(userId, roleId));
    await this.userRolesRepo.softDeleteById(assignment.id);
    await this.forget([userId]);
  }

  @Transactional()
  async mapPermission(roleId: string, permissionId: string): Promise<RolePermission> {
    await this.requireMappableRole(roleId);
    await this.requireGrantablePermission(permissionId);
    if (await this.rolePermissionsRepo.findLive(roleId, permissionId)) {
      throw new ConflictError(RBAC_MESSAGES.PERMISSION_ALREADY_MAPPED);
    }
    const mapping = await this.createUnique(
      () => this.rolePermissionsRepo.create({ roleId, permissionId }),
      RBAC_MESSAGES.PERMISSION_ALREADY_MAPPED,
    );
    await this.forget(await this.userRolesRepo.findHolderIds(roleId));
    return mapping;
  }

  @Transactional()
  async unmapPermission(roleId: string, permissionId: string): Promise<void> {
    await this.requireMappableRole(roleId);
    const mapping = await this.rolePermissionsRepo.findLive(roleId, permissionId);
    if (!mapping) throw new NotFoundError(rbacPermissionNotMappedMessage(roleId, permissionId));
    await this.rolePermissionsRepo.softDeleteById(mapping.id);
    await this.forget(await this.userRolesRepo.findHolderIds(roleId));
  }

  /** An extra permission for one user, optionally until `expiresAt` (D51). */
  @Transactional()
  async grantPermission(
    userId: string,
    permissionId: string,
    input: GrantPermissionInput = {},
  ): Promise<UserPermission> {
    const expiresAt = input.expiresAt ?? null;
    if (expiresAt !== null && Temporal.Instant.compare(expiresAt, nowInstant()) <= 0) {
      throw new BadRequestError(RBAC_MESSAGES.EXPIRY_IN_PAST);
    }
    await this.requireLiveUser(userId);
    await this.requireGrantablePermission(permissionId);
    if (await this.userPermissionsRepo.findLive(userId, permissionId)) {
      throw new ConflictError(RBAC_MESSAGES.PERMISSION_ALREADY_GRANTED);
    }
    const granted = await this.createUnique(
      () =>
        this.userPermissionsRepo.create({
          userId,
          permissionId,
          expiresAt,
          note: input.note ?? null,
        }),
      RBAC_MESSAGES.PERMISSION_ALREADY_GRANTED,
    );
    await this.forget([userId]);
    return granted;
  }

  /** Soft delete = revocation (D55), audited — also for a grant that has already expired. */
  @Transactional()
  async revokePermission(userId: string, permissionId: string): Promise<void> {
    const grant = await this.userPermissionsRepo.findLive(userId, permissionId);
    if (!grant) throw new NotFoundError(rbacPermissionNotGrantedMessage(userId, permissionId));
    await this.userPermissionsRepo.softDeleteById(grant.id);
    await this.forget([userId]);
  }

  /** The configured TTL, cut to the first grant that expires sooner (at least one second). */
  private cacheTtl(grants: readonly ActiveGrant[]): number {
    const now = nowInstant().epochMilliseconds;
    return grants.reduce((ttl, grant) => {
      if (grant.expiresAt === null) return ttl;
      const left = Math.ceil((grant.expiresAt.epochMilliseconds - now) / 1000);
      return Math.max(1, Math.min(ttl, left));
    }, this.ttlSeconds);
  }

  /** Drops the cached permissions of `userIds` once the change has committed. */
  private async forget(userIds: readonly string[]): Promise<void> {
    await afterCommit(async () => {
      for (let start = 0; start < userIds.length; start += INVALIDATION_BATCH) {
        await Promise.all(
          userIds
            .slice(start, start + INVALIDATION_BATCH)
            .map((userId) => this.cache.del(CACHE_KEYS.userPermissions(userId))),
        );
      }
    });
  }

  /** A unique violation of a concurrent identical write is the same conflict as the check before it. */
  private async createUnique<T>(
    create: () => Promise<T>,
    conflict: (typeof RBAC_MESSAGES)[keyof typeof RBAC_MESSAGES],
  ): Promise<T> {
    try {
      return await create();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(conflict);
      throw error;
    }
  }

  private async requireLiveUser(userId: string): Promise<void> {
    if (!(await this.userRolesRepo.isLiveUser(userId))) {
      throw new NotFoundError(rbacUserNotFoundMessage(userId));
    }
  }

  private async requireRole(roleId: string): Promise<Role> {
    const role = await this.rolesRepo.findById(roleId);
    if (!role) throw new NotFoundError(rbacRoleNotFoundMessage(roleId));
    return role;
  }

  /** `super_admin` holds everything by definition and has no mapping (D52). */
  private async requireMappableRole(roleId: string): Promise<void> {
    const role = await this.requireRole(roleId);
    if (role.key === SUPER_ADMIN_ROLE) throw new ConflictError(RBAC_MESSAGES.SUPER_ADMIN_FIXED);
  }

  private async requireGrantablePermission(permissionId: string): Promise<void> {
    if (!(await this.permissionsRepo.findGrantableById(permissionId))) {
      throw new NotFoundError(rbacPermissionNotFoundMessage(permissionId));
    }
  }
}

export const rbacService = new RbacService();
