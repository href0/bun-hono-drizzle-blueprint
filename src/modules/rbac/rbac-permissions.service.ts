import { ConflictError, NotFoundError } from '../../core/errors';
import { Transactional } from '../../database/transactional.decorator';
import { isUniqueViolation } from '../../database/unique-violation';
import type { Permission } from '../../database/schema';
import { withEndpoints, type PermissionWithEndpoints } from './rbac-endpoints.util';
import type {
  CreateMenuPermissionDto,
  PermissionListQueryDto,
  UpdateMenuPermissionDto,
} from './rbac-permissions.dto';
import {
  RbacPermissionsRepository,
  rbacPermissionsRepository,
} from './rbac-permissions.repository';
import { RbacService, rbacService } from './rbac.service';
import { RBAC_MESSAGES, rbacPermissionMissingMessage } from './rbac.messages';

/**
 * Administration of permissions (plan RBAC step 6a): every permission with the endpoints it opens
 * (D47), and the menu permissions an administrator creates for the frontend (E1). API permissions
 * come from the registry in code and are never changed here. Deleting or restoring a menu
 * permission changes what its holders hold: their cached permissions are dropped after the commit.
 * A restore needs no escalation check: a menu permission only steers the frontend's menu, it opens
 * no endpoint.
 */
export class RbacPermissionsService {
  constructor(
    private readonly permissionsRepo: RbacPermissionsRepository = rbacPermissionsRepository,
    private readonly rbac: RbacService = rbacService,
  ) {}

  async listPermissions(
    query: PermissionListQueryDto,
  ): Promise<{ permissions: PermissionWithEndpoints[]; total: number }> {
    const { rows, total } = await this.permissionsRepo.findPermissionList(query);
    return { permissions: await withEndpoints(rows), total };
  }

  async getPermission(id: string): Promise<PermissionWithEndpoints> {
    const [permission] = await withEndpoints([await this.findOrFail(id)]);
    return permission;
  }

  @Transactional()
  async createMenuPermission(dto: CreateMenuPermissionDto): Promise<PermissionWithEndpoints> {
    let created: Permission;
    try {
      created = await this.permissionsRepo.create({
        key: dto.key,
        label: dto.label,
        groupName: dto.group,
        source: 'menu',
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(RBAC_MESSAGES.PERMISSION_KEY_TAKEN);
      throw error;
    }
    return { ...created, endpoints: [] };
  }

  @Transactional()
  async updateMenuPermission(
    id: string,
    dto: UpdateMenuPermissionDto,
  ): Promise<PermissionWithEndpoints> {
    requireMenu(await this.findOrFail(id));
    const updated = await this.permissionsRepo.updateById(id, {
      ...(dto.label === undefined ? {} : { label: dto.label }),
      ...(dto.group === undefined ? {} : { groupName: dto.group }),
    });
    if (!updated) throw new NotFoundError(rbacPermissionMissingMessage(id));
    return { ...updated, endpoints: [] };
  }

  /** Soft delete: roles and users that had it lose it at once; mappings and grants stay for a restore. */
  @Transactional()
  async deleteMenuPermission(id: string): Promise<void> {
    requireMenu(await this.findOrFail(id));
    const holders = await this.permissionsRepo.findHolderIds(id);
    if (!(await this.permissionsRepo.softDeleteById(id))) {
      throw new NotFoundError(rbacPermissionMissingMessage(id));
    }
    await this.rbac.forget(holders);
  }

  @Transactional()
  async restoreMenuPermission(id: string): Promise<PermissionWithEndpoints> {
    const permission = await this.permissionsRepo.findIncludingDeleted(id);
    if (!permission) throw new NotFoundError(rbacPermissionMissingMessage(id));
    requireMenu(permission);
    let restored: Permission | null;
    try {
      restored = await this.permissionsRepo.restoreById(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(RBAC_MESSAGES.PERMISSION_KEY_TAKEN);
      throw error;
    }
    if (!restored) throw new NotFoundError(rbacPermissionMissingMessage(id));
    await this.rbac.forget(await this.permissionsRepo.findHolderIds(id));
    return { ...restored, endpoints: [] };
  }

  private async findOrFail(id: string): Promise<Permission> {
    const permission = await this.permissionsRepo.findById(id);
    if (!permission) throw new NotFoundError(rbacPermissionMissingMessage(id));
    return permission;
  }
}

/** API permissions follow the registry in code (E1): never changed through the API. */
const requireMenu = (permission: Permission): void => {
  if (permission.source !== 'menu') throw new ConflictError(RBAC_MESSAGES.API_PERMISSION_FIXED);
};

export const rbacPermissionsService = new RbacPermissionsService();
