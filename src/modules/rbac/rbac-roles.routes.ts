import { Hono } from 'hono';
import { z } from 'zod';
import { uuidChildParamSchema, uuidParamSchema } from '../../core/dto/common.dto';
import { APP_ERROR_CODES } from '../../core/errors';
import { requirePermission, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { permissionResponseSchema } from './rbac-permissions.dto';
import { accessChangeSchema, replaceRolePermissionsSchema } from './rbac-replace.dto';
import { rbacRolesController } from './rbac-roles.controller';
import {
  createRoleSchema,
  roleListQuerySchema,
  roleOptionSchema,
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
// Before `/:id`: `options` is not an id.
rbacRolesRouter.get(
  '/options',
  describeEndpoint({
    tags,
    summary: 'Every role for the role checklist of a user, by key (not paginated)',
    description:
      'Every live role, sorted by key. `grantable` is false for a role the caller may not give or take: one that gives a permission the caller does not hold, or `super_admin` for anyone but a super admin (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` on `PUT /users/:id/roles`).',
    response: {
      status: 200,
      description: 'The roles by key',
      message: RBAC_MESSAGES.ROLE_OPTIONS_RETRIEVED,
      data: z.array(roleOptionSchema),
    },
  }),
  requirePermission(ROLE_PERMISSIONS.read),
  rbacRolesController.options,
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
  '/:id/permissions',
  describeEndpoint({
    tags,
    summary: 'Replace the permissions of a role (a checklist saved at once)',
    description:
      'The body is the whole set the role should hold: a permission left out is removed, `[]` removes every one. Only the difference is written, in one transaction — nothing is saved when one item is refused. 400 for an unknown, retired or repeated id (its index in `details`); 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` naming every permission added or removed that the caller does not hold (one that no longer counts may be removed); `super_admin` has no mapping (409).',
    response: {
      status: 200,
      description: 'What was added, removed and kept, each by key',
      message: RBAC_MESSAGES.ROLE_PERMISSIONS_REPLACED,
      data: accessChangeSchema,
    },
    errors: [400, 404, 409, ESCALATION],
  }),
  requirePermission(ROLE_PERMISSIONS.update),
  validate({ params: uuidParamSchema, body: replaceRolePermissionsSchema }),
  rbacRolesController.replacePermissions,
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
    description:
      'The caller must hold the permission (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`), unless it no longer counts (retired or deleted); `super_admin` has no mapping (409).',
    response: {
      status: 200,
      description: 'Removed',
      message: RBAC_MESSAGES.ROLE_PERMISSION_UNMAPPED,
      data: z.null(),
    },
    errors: [404, 409, ESCALATION],
  }),
  requirePermission(ROLE_PERMISSIONS.update),
  validate({ params: uuidChildParamSchema }),
  rbacRolesController.removePermission,
);
