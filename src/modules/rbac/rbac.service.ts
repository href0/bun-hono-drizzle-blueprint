import { z } from 'zod';
import { authConfig } from '../../config';
import { CacheService, cacheService, CACHE_KEYS } from '../../core/cache';
import { SUPER_ADMIN_ROLE, type EffectivePermissions } from '../../core/security/rbac';
import { afterCommit } from '../../database/transactional.decorator';
import { nowInstant } from '../../utils/datetime.util';
import {
  RbacPermissionsRepository,
  rbacPermissionsRepository,
} from './rbac-permissions.repository';
import {
  RbacUserPermissionsRepository,
  rbacUserPermissionsRepository,
  type ActiveGrant,
} from './rbac-user-permissions.repository';
import { RbacUserRolesRepository, rbacUserRolesRepository } from './rbac-user-roles.repository';

const cachedPermissionsSchema = z.object({
  superAdmin: z.boolean(),
  permissions: z.array(z.string()),
});

/** Cache entries dropped at once after a role change (one DEL each, fail-open). */
const INVALIDATION_BATCH = 100;

/**
 * RBAC (D52, D53): the effective permissions of a user, cached per user (D53), and the one way to
 * drop that cache (`forget`). Every change of access lives in `RbacAccessService`
 * (rbac-access.service.ts) and calls `forget` for the users it touches: the entries are dropped
 * after the outermost commit (`afterCommit`, D63), so a concurrent read cannot cache the old state
 * again. Redis down: reads go to the database, a missed drop is bounded by
 * `RBAC_PERMISSION_CACHE_TTL_SECONDS`.
 */
export class RbacService {
  constructor(
    private readonly permissionsRepo: RbacPermissionsRepository = rbacPermissionsRepository,
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

  /** The effective permissions as the frontend needs them: a super admin gets every key that counts. */
  async listMyPermissions(userId: string): Promise<EffectivePermissions> {
    const effective = await this.getEffectivePermissions(userId);
    if (!effective.superAdmin) return effective;
    const all = await this.permissionsRepo.findCounting();
    return { superAdmin: true, permissions: all.map(({ key }) => key) };
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

  /**
   * Drops the cached permissions of `userIds` once the change has committed (D63) — for every
   * change in the module that alters what users hold (a role or a permission deleted / restored).
   */
  async forget(userIds: readonly string[]): Promise<void> {
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
}

export const rbacService = new RbacService();
