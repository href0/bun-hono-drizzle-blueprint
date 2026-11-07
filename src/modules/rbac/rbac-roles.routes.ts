import { Hono } from 'hono';
import { z } from 'zod';
import { uuidChildParamSchema, uuidParamSchema } from '../../core/dto/common.dto';
import { APP_ERROR_CODES } from '../../core/errors';
import { requirePermission, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { permissionResponseSchema } from './rbac-permissions.dto';
import { rbacRolesController } from './rbac-roles.controller';
import {
  createRoleSchema,
  roleListQuerySchema,
  roleResponseSchema,
  updateRoleSchema,
} from './rbac-roles.dto';
import { RBAC_MESSAGES } from './rbac.messages';
import { ROLE_PERMISSIONS } from './rbac.permissions';

/** `/roles`: roles and the permissions mapped to them (D68). */
export const rbacRolesRouter = new Hono();

const tags = ['Roles'];
const ESCALATION = {
  status: 403,
  codes: [APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN],
} as const;

rbacRolesRouter.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a role',
    response: {
      status: 201,
      description: 'Role created',
      message: RBAC_MESSAGES.ROLE_CREATED,
      data: roleResponseSchema,
    },
    errors: [409],
  }),
  requirePermission(ROLE_PERMISSIONS.create),
  validate({ body: createRoleSchema }),
  rbacRolesController.create,
);
rbacRolesRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List roles (paginated, sortable, searchable)',
    response: {
      status: 200,
      description: 'A page of roles',
      message: RBAC_MESSAGES.ROLE_LIST_RETRIEVED,
      paginatedItem: roleResponseSchema,
    },
  }),
  requirePermission(ROLE_PERMISSIONS.read),
  validate({ query: roleListQuerySchema }),
  rbacRolesController.list,
);
rbacRolesRouter.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a role by id',
    response: {
      status: 200,
      description: 'The role',
      message: RBAC_MESSAGES.ROLE_RETRIEVED,
      data: roleResponseSchema,
    },
    errors: [404],
  }),
  requirePermission(ROLE_PERMISSIONS.read),
  validate({ params: uuidParamSchema }),
  rbacRolesController.getById,
);
rbacRolesRouter.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a role (name, description; super_admin cannot be changed)',
    response: {
      status: 200,
      description: 'The updated role',
      message: RBAC_MESSAGES.ROLE_UPDATED,
      data: roleResponseSchema,
    },
    errors: [404, 409],
  }),
  requirePermission(ROLE_PERMISSIONS.update),
  validate({ params: uuidParamSchema, body: updateRoleSchema }),
  rbacRolesController.update,
);
rbacRolesRouter.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a role (soft delete; system roles cannot be deleted)',
    response: {
      status: 200,
      description: 'Role deleted',
      message: RBAC_MESSAGES.ROLE_DELETED,
      data: z.null(),
    },
    errors: [404, 409],
  }),
  requirePermission(ROLE_PERMISSIONS.delete),
  validate({ params: uuidParamSchema }),
  rbacRolesController.remove,
);
rbacRolesRouter.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a deleted role (the caller must hold its permissions)',
    response: {
      status: 200,
      description: 'The restored role',
      message: RBAC_MESSAGES.ROLE_RESTORED,
      data: roleResponseSchema,
    },
    errors: [404, 409, ESCALATION],
  }),
  requirePermission(ROLE_PERMISSIONS.restore),
  validate({ params: uuidParamSchema }),
  rbacRolesController.restore,
);
rbacRolesRouter.get(
  '/:id/permissions',
  describeEndpoint({
    tags,
    summary: 'List the permissions of a role (super_admin: every permission)',
    response: {
      status: 200,
      description: 'The permissions of the role, by key',
      message: RBAC_MESSAGES.ROLE_PERMISSIONS_RETRIEVED,
      data: z.array(permissionResponseSchema),
    },
    errors: [404],
  }),
  requirePermission(ROLE_PERMISSIONS.read),
  validate({ params: uuidParamSchema }),
  rbacRolesController.listPermissions,
);
rbacRolesRouter.put(
  '/:id/permissions/:childId',
  describeEndpoint({
    tags,
    summary: 'Add a permission to a role (201 added, 200 already there)',
    description:
      'Idempotent. The caller must hold the permission themselves (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`); `super_admin` has no mapping (409).',
    response: {
      status: 201,
      description: 'Added',
      message: RBAC_MESSAGES.ROLE_PERMISSION_MAPPED,
      data: z.null(),
    },
    alsoResponds: [
      {
        status: 200,
        description: 'Already there',
        message: RBAC_MESSAGES.PERMISSION_ALREADY_MAPPED,
      },
    ],
    errors: [404, 409, ESCALATION],
  }),
  requirePermission(ROLE_PERMISSIONS.update),
  validate({ params: uuidChildParamSchema }),
  rbacRolesController.putPermission,
);
rbacRolesRouter.delete(
  '/:id/permissions/:childId',
  describeEndpoint({
    tags,
    summary: 'Remove a permission from a role',
    response: {
      status: 200,
      description: 'Removed',
      message: RBAC_MESSAGES.ROLE_PERMISSION_UNMAPPED,
      data: z.null(),
    },
    errors: [404, 409],
  }),
  requirePermission(ROLE_PERMISSIONS.update),
  validate({ params: uuidChildParamSchema }),
  rbacRolesController.removePermission,
);
