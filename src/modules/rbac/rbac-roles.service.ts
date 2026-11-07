import { ConflictError, NotFoundError } from '../../core/errors';
import { SUPER_ADMIN_ROLE } from '../../core/security/rbac';
import { Transactional } from '../../database/transactional.decorator';
import { isUniqueViolation } from '../../database/unique-violation';
import type { Role } from '../../database/schema';
import { withEndpoints, type PermissionWithEndpoints } from './rbac-endpoints.util';
import { requireActorHolds } from './rbac-grant-guard.util';
import {
  RbacPermissionsRepository,
  rbacPermissionsRepository,
} from './rbac-permissions.repository';
import {
  RbacRolePermissionsRepository,
  rbacRolePermissionsRepository,
} from './rbac-role-permissions.repository';
import type { CreateRoleDto, RoleListQueryDto, UpdateRoleDto } from './rbac-roles.dto';
import { RbacRolesRepository, rbacRolesRepository } from './rbac-roles.repository';
import { RbacUserRolesRepository, rbacUserRolesRepository } from './rbac-user-roles.repository';
import { RbacService, rbacService } from './rbac.service';
import { RBAC_MESSAGES, rbacRoleNotFoundMessage } from './rbac.messages';

/**
 * Administration of roles (plan RBAC step 6a): CRUD and the permissions mapped to a role.
 * `super_admin` holds every permission and cannot be changed; system roles cannot be deleted; a
 * role's key never changes. Deleting or restoring a role changes what its holders hold: their
 * cached permissions are dropped after the commit. Restoring a role gives its permissions back, so
 * the caller must hold them (no escalation, `requireActorHolds`).
 */
export class RbacRolesService {
  constructor(
    private readonly rolesRepo: RbacRolesRepository = rbacRolesRepository,
    private readonly permissionsRepo: RbacPermissionsRepository = rbacPermissionsRepository,
    private readonly rolePermissionsRepo: RbacRolePermissionsRepository = rbacRolePermissionsRepository,
    private readonly userRolesRepo: RbacUserRolesRepository = rbacUserRolesRepository,
    private readonly rbac: RbacService = rbacService,
  ) {}

  async listRoles(query: RoleListQueryDto): Promise<{ roles: Role[]; total: number }> {
    const { rows, total } = await this.rolesRepo.findRoleList(query);
    return { roles: rows, total };
  }

  async getRole(id: string): Promise<Role> {
    const role = await this.rolesRepo.findById(id);
    if (!role) throw new NotFoundError(rbacRoleNotFoundMessage(id));
    return role;
  }

  @Transactional()
  async createRole(dto: CreateRoleDto): Promise<Role> {
    try {
      return await this.rolesRepo.create({
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(RBAC_MESSAGES.ROLE_KEY_TAKEN);
      throw error;
    }
  }

  @Transactional()
  async updateRole(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.getRole(id);
    if (role.key === SUPER_ADMIN_ROLE) throw new ConflictError(RBAC_MESSAGES.SUPER_ADMIN_FIXED);
    const updated = await this.rolesRepo.updateById(id, dto);
    if (!updated) throw new NotFoundError(rbacRoleNotFoundMessage(id));
    return updated;
  }

  /** Soft delete: its holders lose its permissions at once; the assignments stay for a restore. */
  @Transactional()
  async deleteRole(id: string): Promise<void> {
    const role = await this.getRole(id);
    if (role.isSystem) throw new ConflictError(RBAC_MESSAGES.SYSTEM_ROLE_FIXED);
    const holders = await this.userRolesRepo.findHolderIds(id);
    if (!(await this.rolesRepo.softDeleteById(id))) {
      throw new NotFoundError(rbacRoleNotFoundMessage(id));
    }
    await this.rbac.forget(holders);
  }

  /** Brings a deleted role back — with its mappings and holders, so only for a caller holding them. */
  @Transactional()
  async restoreRole(id: string): Promise<Role> {
    const mapped = await this.permissionsRepo.findMappedToRole(id);
    await requireActorHolds(
      mapped.filter((permission) => permission.retiredAt === null).map(({ key }) => key),
    );
    let restored: Role | null;
    try {
      restored = await this.rolesRepo.restoreById(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(RBAC_MESSAGES.ROLE_KEY_TAKEN);
      throw error;
    }
    if (!restored) throw new NotFoundError(rbacRoleNotFoundMessage(id));
    await this.rbac.forget(await this.userRolesRepo.findHolderIds(id));
    return restored;
  }

  /** The permissions of a role; for `super_admin`, every permission that counts (D52). */
  async listRolePermissions(id: string): Promise<PermissionWithEndpoints[]> {
    const role = await this.getRole(id);
    const permissions =
      role.key === SUPER_ADMIN_ROLE
        ? await this.permissionsRepo.findCounting()
        : await this.permissionsRepo.findMappedToRole(id);
    return withEndpoints(permissions);
  }

  /**
   * Adds a permission to a role (`PUT`, idempotent): `created` is false when the role already had
   * it. Checks (role, permission, no escalation) in `RbacService.mapPermission`.
   */
  @Transactional()
  async putRolePermission(roleId: string, permissionId: string): Promise<{ created: boolean }> {
    await this.getRole(roleId);
    if (await this.rolePermissionsRepo.findLive(roleId, permissionId)) return { created: false };
    await this.rbac.mapPermission(roleId, permissionId);
    return { created: true };
  }

  @Transactional()
  async deleteRolePermission(roleId: string, permissionId: string): Promise<void> {
    await this.rbac.unmapPermission(roleId, permissionId);
  }
}

export const rbacRolesService = new RbacRolesService();
