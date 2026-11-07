import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../core/dto/common.dto';
import { requirePermission, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { rbacPermissionsController } from './rbac-permissions.controller';
import {
  createMenuPermissionSchema,
  permissionListQuerySchema,
  permissionResponseSchema,
  updateMenuPermissionSchema,
} from './rbac-permissions.dto';
import { RBAC_MESSAGES } from './rbac.messages';
import { PERMISSION_PERMISSIONS } from './rbac.permissions';

/**
 * `/permissions`: every permission with the endpoints it opens (D47); menu permissions are created
 * and changed here, API permissions only by the registry in code (D64, 409 here).
 */
export const rbacPermissionsRouter = new Hono();

const tags = ['Permissions'];

rbacPermissionsRouter.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List permissions with the endpoints they open (paginated, sortable, searchable)',
    response: {
      status: 200,
      description: 'A page of permissions',
      message: RBAC_MESSAGES.PERMISSION_LIST_RETRIEVED,
      paginatedItem: permissionResponseSchema,
    },
  }),
  requirePermission(PERMISSION_PERMISSIONS.read),
  validate({ query: permissionListQuerySchema }),
  rbacPermissionsController.list,
);
rbacPermissionsRouter.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a permission by id, with the endpoints it opens',
    response: {
      status: 200,
      description: 'The permission',
      message: RBAC_MESSAGES.PERMISSION_RETRIEVED,
      data: permissionResponseSchema,
    },
    errors: [404],
  }),
  requirePermission(PERMISSION_PERMISSIONS.read),
  validate({ params: uuidParamSchema }),
  rbacPermissionsController.getById,
);
rbacPermissionsRouter.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a menu permission (key menu.…)',
    response: {
      status: 201,
      description: 'Menu permission created',
      message: RBAC_MESSAGES.PERMISSION_CREATED,
      data: permissionResponseSchema,
    },
    errors: [409],
  }),
  requirePermission(PERMISSION_PERMISSIONS.create),
  validate({ body: createMenuPermissionSchema }),
  rbacPermissionsController.create,
);
rbacPermissionsRouter.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a menu permission (label, group)',
    response: {
      status: 200,
      description: 'The updated menu permission',
      message: RBAC_MESSAGES.PERMISSION_UPDATED,
      data: permissionResponseSchema,
    },
    errors: [404, 409],
  }),
  requirePermission(PERMISSION_PERMISSIONS.update),
  validate({ params: uuidParamSchema, body: updateMenuPermissionSchema }),
  rbacPermissionsController.update,
);
rbacPermissionsRouter.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a menu permission (soft delete; restorable)',
    response: {
      status: 200,
      description: 'Menu permission deleted',
      message: RBAC_MESSAGES.PERMISSION_DELETED,
      data: z.null(),
    },
    errors: [404, 409],
  }),
  requirePermission(PERMISSION_PERMISSIONS.delete),
  validate({ params: uuidParamSchema }),
  rbacPermissionsController.remove,
);
rbacPermissionsRouter.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a deleted menu permission',
    response: {
      status: 200,
      description: 'The restored menu permission',
      message: RBAC_MESSAGES.PERMISSION_RESTORED,
      data: permissionResponseSchema,
    },
    errors: [404, 409],
  }),
  requirePermission(PERMISSION_PERMISSIONS.restore),
  validate({ params: uuidParamSchema }),
  rbacPermissionsController.restore,
);
