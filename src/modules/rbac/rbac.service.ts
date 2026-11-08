import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { authConfig } from '../../config';
import { CacheService, cacheService, CACHE_KEYS } from '../../core/cache';
import {
  APP_ERROR_CODES,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors';
import { SUPER_ADMIN_ROLE, type EffectivePermissions } from '../../core/security/rbac';
import { afterCommit, Transactional } from '../../database/transactional.decorator';
import { SuperAdminsRepository, superAdminsRepository } from '../../database/rbac/super-admins';
import { isUniqueViolation } from '../../database/unique-violation';
import type {
  Permission,
  Role,
  RolePermission,
  UserPermission,
  UserRole,
} from '../../database/schema';
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
import type { AccessChange, ChangedItem } from './rbac-replace.dto';
import { diffIds } from './rbac-replace.util';
import type { GrantWithPermission } from './rbac-user-access.dto';
import { RbacUserRolesRepository, rbacUserRolesRepository } from './rbac-user-roles.repository';
import { actorUserId, requireActorHolds, requireActorIsSuperAdmin } from './rbac-grant-guard.util';
import {
  RBAC_MESSAGES,
  rbacPermissionNotFoundMessage,
  rbacPermissionNotGrantedMessage,
  rbacPermissionNotMappedMessage,
  rbacRoleNotAssignedMessage,
  rbacRoleNotFoundMessage,
  rbacUserNotFoundMessage,
} from './rbac.messages';

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
 * RBAC (D52, D53): the effective permissions of a user, cached per user (D53), and every
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
    private readonly superAdmins: SuperAdminsRepository = superAdminsRepository,
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

  /** The live roles of a live user, by key. */
  async listUserRoles(userId: string): Promise<Role[]> {
    await this.requireLiveUser(userId);
    return this.userRolesRepo.findRolesOf(userId);
  }

  /** The live extra permissions of a live user (expired ones included), by key. */
  async listUserGrants(userId: string): Promise<GrantWithPermission[]> {
    await this.requireLiveUser(userId);
    return this.userPermissionsRepo.findGrantsOf(userId);
  }

  /**
   * Gives a role to a user. `super_admin` only by a super admin; any other role only by someone
   * holding every permission it carries (no escalation, D69).
   */
  @Transactional()
  async assignRole(userId: string, roleId: string): Promise<UserRole> {
    await this.requireLiveUser(userId);
    const role = await this.findRoleOrFail(roleId);
    if (role.key === SUPER_ADMIN_ROLE) {
      await requireActorIsSuperAdmin();
    } else {
      await requireActorHolds(await this.countingKeysOf(roleId));
    }
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

  /** `PUT`: gives the role unless the user already has it (`created` false, nothing checked or written). */
  @Transactional()
  async putUserRole(userId: string, roleId: string): Promise<{ created: boolean }> {
    await this.requireLiveUser(userId);
    await this.findRoleOrFail(roleId);
    if (await this.userRolesRepo.findLive(userId, roleId)) return { created: false };
    await this.assignRole(userId, roleId);
    return { created: true };
  }

  /**
   * Soft delete = revocation (D55), audited. `super_admin` (anti-lockout, D69): only a
   * super admin takes it, never from themselves (403 `ERR_SELF_LOCKOUT_FORBIDDEN`), and never from
   * the last live, active user holding it (409) — the holders are locked, so two concurrent
   * revocations cannot both pass.
   */
  @Transactional()
  async revokeRole(userId: string, roleId: string): Promise<void> {
    const role = await this.rolesRepo.findById(roleId);
    if (role !== null && role.key !== SUPER_ADMIN_ROLE) {
      // D74: taking a role away needs what it carries, like giving it.
      await requireActorHolds(await this.countingKeysOf(roleId));
    }
    if (role?.key === SUPER_ADMIN_ROLE) await this.requireSuperAdminRevocable(userId);
    const assignment = await this.userRolesRepo.findLive(userId, roleId);
    if (!assignment) throw new NotFoundError(rbacRoleNotAssignedMessage(userId, roleId));
    await this.userRolesRepo.softDeleteById(assignment.id);
    await this.forget([userId]);
  }

  /**
   * Adds a permission to a role. Whoever does it must hold the permission (no escalation through a
   * role the caller holds or assigns, `requireActorHolds`).
   */
  @Transactional()
  async mapPermission(roleId: string, permissionId: string): Promise<RolePermission> {
    await this.requireMappableRole(roleId);
    const permission = await this.requireGrantablePermission(permissionId);
    await requireActorHolds([permission.key]);
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
    await this.requireActorHoldsIfCounting(permissionId);
    const mapping = await this.rolePermissionsRepo.findLive(roleId, permissionId);
    if (!mapping) throw new NotFoundError(rbacPermissionNotMappedMessage(roleId, permissionId));
    await this.rolePermissionsRepo.softDeleteById(mapping.id);
    await this.forget(await this.userRolesRepo.findHolderIds(roleId));
  }

  /**
   * Replaces the permissions of a role with `permissionIds` (D72): only the difference is written —
   * new mappings created, missing ones unmapped, the rest untouched. Every check runs before the
   * first write: the role can be mapped, every added permission can be given (400 naming its
   * index), and the caller holds every permission added or taken that still counts (D74). The
   * holders' cache is dropped once, after the commit, only when something changed.
   */
  @Transactional()
  async replaceRolePermissions(
    roleId: string,
    permissionIds: readonly string[],
  ): Promise<AccessChange> {
    await this.requireMappableRole(roleId);
    const mappings = await this.rolePermissionsRepo.findMappingsOf(roleId);
    const byPermission = new Map(mappings.map((row) => [row.permission.id, row]));
    const diff = diffIds([...byPermission.keys()], permissionIds);
    const adding = await this.requireGrantableAll(
      diff.added,
      (id) => `permissionIds.${String(permissionIds.indexOf(id))}`,
    );
    const removing = mappings.filter((row) => diff.removed.includes(row.permission.id));
    await requireActorHolds([
      ...adding.map(({ key }) => key),
      ...removing
        .filter((row) => row.permission.retiredAt === null)
        .map((row) => row.permission.key),
    ]);
    for (const permission of adding) {
      await this.createUnique(
        () => this.rolePermissionsRepo.create({ roleId, permissionId: permission.id }),
        RBAC_MESSAGES.PERMISSION_ALREADY_MAPPED,
      );
    }
    for (const row of removing) await this.rolePermissionsRepo.softDeleteById(row.mapping.id);
    if (adding.length + removing.length > 0) {
      await this.forget(await this.userRolesRepo.findHolderIds(roleId));
    }
    return {
      added: adding.map(changedItem),
      removed: removing.map((row) => changedItem(row.permission)),
      unchanged: mappings
        .filter((row) => diff.unchanged.includes(row.permission.id))
        .map((row) => changedItem(row.permission)),
    };
  }

  /**
   * Replaces the roles of a user with `roleIds` (D72) — only the difference is written, every
   * check before the first write: the user is live, every added role is live (400 naming its
   * index), the caller holds every permission of each role added or removed (D69, D74, one 403
   * naming all), `super_admin` is given or taken only by a super admin, never from oneself, never
   * from the last active holder. The user's cache is dropped once, only when something changed.
   */
  @Transactional()
  async replaceUserRoles(userId: string, roleIds: readonly string[]): Promise<AccessChange> {
    await this.requireLiveUser(userId);
    const assignments = await this.userRolesRepo.findAssignmentsOf(userId);
    const diff = diffIds(
      assignments.map(({ role }) => role.id),
      roleIds,
    );
    const adding = await this.rolesRepo.findLiveByIds(diff.added);
    refuseUnknown(
      diff.added,
      adding,
      (id) => `roleIds.${String(roleIds.indexOf(id))}`,
      RBAC_MESSAGES.ROLE_NOT_ASSIGNABLE,
    );
    const removing = assignments.filter(({ role }) => diff.removed.includes(role.id));
    const touched = [...adding, ...removing.map(({ role }) => role)];
    if (touched.some(({ key }) => key === SUPER_ADMIN_ROLE)) await requireActorIsSuperAdmin();
    const carried = new Set<string>();
    for (const role of touched.filter(({ key }) => key !== SUPER_ADMIN_ROLE)) {
      for (const key of await this.countingKeysOf(role.id)) carried.add(key);
    }
    await requireActorHolds([...carried].sort());
    if (removing.some(({ role }) => role.key === SUPER_ADMIN_ROLE)) {
      await this.requireSuperAdminRevocable(userId);
    }
    for (const role of adding) {
      await this.createUnique(
        () => this.userRolesRepo.create({ userId, roleId: role.id }),
        RBAC_MESSAGES.ROLE_ALREADY_ASSIGNED,
      );
    }
    for (const { assignment } of removing) await this.userRolesRepo.softDeleteById(assignment.id);
    if (touched.length > 0) await this.forget([userId]);
    return {
      added: adding.map(changedItem),
      removed: removing.map(({ role }) => changedItem(role)),
      unchanged: assignments
        .filter(({ role }) => diff.unchanged.includes(role.id))
        .map(({ role }) => changedItem(role)),
    };
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
    const permission = await this.requireGrantablePermission(permissionId);
    await requireActorHolds([permission.key]);
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

  /**
   * `PUT`: grants the permission, or changes the expiry and note of the live grant (`created`
   * false). Both only by someone holding the permission (no escalation, also when extending a grant).
   */
  @Transactional()
  async putGrant(
    userId: string,
    permissionId: string,
    input: GrantPermissionInput = {},
  ): Promise<{ grant: GrantWithPermission; created: boolean }> {
    const existing = await this.userPermissionsRepo.findLive(userId, permissionId);
    if (!existing) {
      const grant = await this.grantPermission(userId, permissionId, input);
      const permission = await this.requireGrantablePermission(permissionId);
      return { grant: { grant, permission }, created: true };
    }
    const expiresAt = input.expiresAt ?? null;
    if (expiresAt !== null && Temporal.Instant.compare(expiresAt, nowInstant()) <= 0) {
      throw new BadRequestError(RBAC_MESSAGES.EXPIRY_IN_PAST);
    }
    const permission = await this.requireGrantablePermission(permissionId);
    await requireActorHolds([permission.key]);
    const updated = await this.userPermissionsRepo.updateById(existing.id, {
      expiresAt,
      note: input.note ?? null,
    });
    if (!updated) throw new NotFoundError(rbacPermissionNotGrantedMessage(userId, permissionId));
    await this.forget([userId]);
    return { grant: { grant: updated, permission }, created: false };
  }

  /** Soft delete = revocation (D55), audited — also for a grant that has already expired. */
  @Transactional()
  async revokePermission(userId: string, permissionId: string): Promise<void> {
    await this.requireActorHoldsIfCounting(permissionId);
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

  private async findRoleOrFail(roleId: string): Promise<Role> {
    const role = await this.rolesRepo.findById(roleId);
    if (!role) throw new NotFoundError(rbacRoleNotFoundMessage(roleId));
    return role;
  }

  /** `super_admin` holds everything by definition and has no mapping (D52). */
  private async requireMappableRole(roleId: string): Promise<void> {
    const role = await this.findRoleOrFail(roleId);
    if (role.key === SUPER_ADMIN_ROLE) throw new ConflictError(RBAC_MESSAGES.SUPER_ADMIN_FIXED);
  }

  /** The keys a role gives (live, not retired): what giving or taking it needs (D69, D74). */
  private async countingKeysOf(roleId: string): Promise<string[]> {
    const carried = await this.permissionsRepo.findMappedToRole(roleId);
    return carried.filter((permission) => permission.retiredAt === null).map(({ key }) => key);
  }

  /**
   * Taking a permission away needs it (D74) — unless it no longer counts (retired, deleted): it
   * gives nothing, and only a super admin could hold it.
   */
  private async requireActorHoldsIfCounting(permissionId: string): Promise<void> {
    const permission = await this.permissionsRepo.findGrantableById(permissionId);
    if (permission) await requireActorHolds([permission.key]);
  }

  /** The permissions of `ids`, each grantable (live, not retired) — otherwise 400 at `fieldOf(id)`. */
  private async requireGrantableAll(
    ids: readonly string[],
    fieldOf: (id: string) => string,
  ): Promise<Permission[]> {
    const found = await this.permissionsRepo.findGrantableByIds(ids);
    refuseUnknown(ids, found, fieldOf, RBAC_MESSAGES.PERMISSION_NOT_GRANTABLE);
    return found;
  }

  /**
   * `super_admin` is taken only by a super admin (403), never from oneself (403
   * `ERR_SELF_LOCKOUT_FORBIDDEN`), never from the last live, active holder (409 — the holders are
   * locked, so two concurrent revocations cannot both pass).
   */
  private async requireSuperAdminRevocable(userId: string): Promise<void> {
    await requireActorIsSuperAdmin();
    if (actorUserId() === userId) {
      throw new ForbiddenError(RBAC_MESSAGES.OWN_SUPER_ADMIN, {
        code: APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN,
      });
    }
    if ((await this.superAdmins.lockOtherActiveHolders(userId)).length === 0) {
      throw new ConflictError(RBAC_MESSAGES.LAST_SUPER_ADMIN);
    }
  }

  private async requireGrantablePermission(permissionId: string): Promise<Permission> {
    const permission = await this.permissionsRepo.findGrantableById(permissionId);
    if (!permission) throw new NotFoundError(rbacPermissionNotFoundMessage(permissionId));
    return permission;
  }
}

export const rbacService = new RbacService();

const changedItem = ({ id, key }: { id: string; key: string }): ChangedItem => ({ id, key });

/**
 * 400 when some of `ids` were not `found`: one detail per refused id at `fieldOf(id)` — its place
 * in the request body — so the frontend can mark it.
 */
const refuseUnknown = (
  ids: readonly string[],
  found: readonly { id: string }[],
  fieldOf: (id: string) => string,
  message: (typeof RBAC_MESSAGES)[keyof typeof RBAC_MESSAGES],
): void => {
  const known = new Set(found.map(({ id }) => id));
  const refused = ids.filter((id) => !known.has(id));
  if (refused.length > 0) {
    throw new ValidationError(undefined, {
      details: refused.map((id) => ({ field: fieldOf(id), message })),
    });
  }
};
