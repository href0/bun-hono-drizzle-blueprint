import { Hono } from 'hono';
import { z } from 'zod';
import { uuidChildParamSchema, uuidParamSchema } from '../../core/dto/common.dto';
import { APP_ERROR_CODES } from '../../core/errors';
import { requirePermission, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { roleResponseSchema } from './rbac-roles.dto';
import { rbacUserAccessController } from './rbac-user-access.controller';
import { putGrantSchema, userGrantResponseSchema } from './rbac-user-access.dto';
import { RBAC_MESSAGES } from './rbac.messages';
import { USER_PERMISSION_PERMISSIONS, USER_ROLE_PERMISSIONS } from './rbac.permissions';

/**
 * `/users/:id/roles` and `/users/:id/permissions`: what a user holds (plan RBAC step 6b), mounted
 * next to the `users` module. Giving needs what is given (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`);
 * `super_admin` only by a super admin, never taken from oneself or from the last active holder.
 */
export const rbacUserAccessRouter = new Hono();

const tags = ['User access'];
const ESCALATION = {
  status: 403,
  codes: [APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN],
} as const;

rbacUserAccessRouter.get(
  '/:id/roles',
  describeEndpoint({
    tags,
    summary: 'List the roles of a user',
    response: {
      status: 200,
      description: 'The live roles of the user, by key',
      message: RBAC_MESSAGES.USER_ROLES_RETRIEVED,
      data: z.array(roleResponseSchema),
    },
    errors: [404],
  }),
  requirePermission(USER_ROLE_PERMISSIONS.read),
  validate({ params: uuidParamSchema }),
  rbacUserAccessController.listRoles,
);
rbacUserAccessRouter.put(
  '/:id/roles/:childId',
  describeEndpoint({
    tags,
    summary: 'Give a role to a user (201 given, 200 already held)',
    description:
      'Idempotent. The caller must hold every permission of the role; `super_admin` only by a super admin (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`).',
    response: {
      status: 201,
      description: 'Given',
      message: RBAC_MESSAGES.USER_ROLE_ASSIGNED,
      data: z.null(),
    },
    alsoResponds: [
      { status: 200, description: 'Already held', message: RBAC_MESSAGES.ROLE_ALREADY_ASSIGNED },
    ],
    errors: [404, 409, ESCALATION],
  }),
  requirePermission(USER_ROLE_PERMISSIONS.create),
  validate({ params: uuidChildParamSchema }),
  rbacUserAccessController.putRole,
);
rbacUserAccessRouter.delete(
  '/:id/roles/:childId',
  describeEndpoint({
    tags,
    summary: 'Revoke a role from a user',
    description:
      '`super_admin`: only by a super admin, never from oneself (403 `ERR_SELF_LOCKOUT_FORBIDDEN`) and never from the last active holder (409).',
    response: {
      status: 200,
      description: 'Revoked',
      message: RBAC_MESSAGES.USER_ROLE_REVOKED,
      data: z.null(),
    },
    errors: [
      404,
      409,
      {
        status: 403,
        codes: [
          APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
          APP_ERROR_CODES.SELF_LOCKOUT_FORBIDDEN,
        ],
      },
    ],
  }),
  requirePermission(USER_ROLE_PERMISSIONS.delete),
  validate({ params: uuidChildParamSchema }),
  rbacUserAccessController.revokeRole,
);
rbacUserAccessRouter.get(
  '/:id/permissions',
  describeEndpoint({
    tags,
    summary: 'List the extra permissions of a user (expired ones included)',
    response: {
      status: 200,
      description: 'The live grants of the user, by permission key',
      message: RBAC_MESSAGES.USER_PERMISSIONS_RETRIEVED,
      data: z.array(userGrantResponseSchema),
    },
    errors: [404],
  }),
  requirePermission(USER_PERMISSION_PERMISSIONS.read),
  validate({ params: uuidParamSchema }),
  rbacUserAccessController.listGrants,
);
rbacUserAccessRouter.put(
  '/:id/permissions/:childId',
  describeEndpoint({
    tags,
    summary: 'Grant an extra permission to a user, or change its expiry and note',
    description:
      'The caller must hold the permission (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`); `expires_at` must lie in the future.',
    response: {
      status: 201,
      description: 'Granted',
      message: RBAC_MESSAGES.USER_PERMISSION_GRANTED,
      data: userGrantResponseSchema,
    },
    alsoResponds: [
      { status: 200, description: 'Updated', message: RBAC_MESSAGES.USER_PERMISSION_UPDATED },
    ],
    errors: [400, 404, 409, ESCALATION],
  }),
  requirePermission(USER_PERMISSION_PERMISSIONS.create),
  validate({ params: uuidChildParamSchema, body: putGrantSchema }),
  rbacUserAccessController.putGrant,
);
rbacUserAccessRouter.delete(
  '/:id/permissions/:childId',
  describeEndpoint({
    tags,
    summary: 'Revoke an extra permission from a user',
    response: {
      status: 200,
      description: 'Revoked',
      message: RBAC_MESSAGES.USER_PERMISSION_REVOKED,
      data: z.null(),
    },
    errors: [404],
  }),
  requirePermission(USER_PERMISSION_PERMISSIONS.delete),
  validate({ params: uuidChildParamSchema }),
  rbacUserAccessController.revokeGrant,
);
