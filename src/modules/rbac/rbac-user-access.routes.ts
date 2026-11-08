import { Hono } from 'hono';
import { z } from 'zod';
import { uuidChildParamSchema, uuidParamSchema } from '../../core/dto/common.dto';
import { APP_ERROR_CODES } from '../../core/errors';
import { requirePermission, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import {
  accessChangeSchema,
  grantChangeSchema,
  replaceUserPermissionsSchema,
  replaceUserRolesSchema,
} from './rbac-replace.dto';
import { roleResponseSchema } from './rbac-roles.dto';
import { rbacUserAccessController } from './rbac-user-access.controller';
import { putGrantSchema, userGrantResponseSchema } from './rbac-user-access.dto';
import { RBAC_MESSAGES } from './rbac.messages';
import { USER_PERMISSION_PERMISSIONS, USER_ROLE_PERMISSIONS } from './rbac.permissions';

/**
 * `/users/:id/roles` and `/users/:id/permissions`: what a user holds (D68), mounted
 * next to the `users` module. Giving or taking needs what is given or taken (403
 * `ERR_PERMISSION_ESCALATION_FORBIDDEN`, D74);
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
  '/:id/roles',
  describeEndpoint({
    tags,
    summary: 'Replace the roles of a user (a checklist saved at once)',
    description:
      'The body is the whole set the user should hold: a role left out is revoked, `[]` revokes every one. Only the difference is written, in one transaction — nothing is saved when one item is refused. 400 for an unknown or repeated id (its index in `details`); 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` naming every permission of a role added or removed that the caller does not hold; `super_admin` only by a super admin, never from oneself (403 `ERR_SELF_LOCKOUT_FORBIDDEN`) and never from the last active holder (409).',
    response: {
      status: 200,
      description: 'What was added, removed and kept, each by key',
      message: RBAC_MESSAGES.USER_ROLES_REPLACED,
      data: accessChangeSchema,
    },
    errors: [
      400,
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
  // A replace gives and takes: a permission of its own (D75), not create + delete — the allowed
  // callers of a route are alternatives, so two guards would document "either" (openapi.md).
  requirePermission(USER_ROLE_PERMISSIONS.update),
  validate({ params: uuidParamSchema, body: replaceUserRolesSchema }),
  rbacUserAccessController.replaceRoles,
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
      'The caller must hold every permission of the role (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`). `super_admin`: only by a super admin, never from oneself (403 `ERR_SELF_LOCKOUT_FORBIDDEN`) and never from the last active holder (409).',
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
  '/:id/permissions',
  describeEndpoint({
    tags,
    summary: 'Replace the extra permissions of a user (a checklist saved at once)',
    description:
      'The body is the whole set the user should hold, each grant with its `expires_at` and `note` (absent = none — send the current ones to keep them): a permission left out is revoked, `[]` revokes every one, a kept grant with another expiry or note is `updated`, an expired grant sent back as it is stays unchanged. Only the difference is written, in one transaction — nothing is saved when one item is refused. 400 for an unknown, retired or repeated permission or an expiry not in the future (its index in `details`); 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` naming every permission granted, updated or revoked that the caller does not hold (one that no longer counts may be revoked).',
    response: {
      status: 200,
      description: 'What was added, updated, removed and kept, each by key',
      message: RBAC_MESSAGES.USER_PERMISSIONS_REPLACED,
      data: grantChangeSchema,
    },
    errors: [400, 404, 409, ESCALATION],
  }),
  // A replace grants and revokes: a permission of its own (D75), not create + delete.
  requirePermission(USER_PERMISSION_PERMISSIONS.update),
  validate({ params: uuidParamSchema, body: replaceUserPermissionsSchema }),
  rbacUserAccessController.replaceGrants,
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
    description:
      'The caller must hold the permission (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`), unless it no longer counts (retired or deleted). An expired grant is revoked like a live one.',
    response: {
      status: 200,
      description: 'Revoked',
      message: RBAC_MESSAGES.USER_PERMISSION_REVOKED,
      data: z.null(),
    },
    errors: [404, ESCALATION],
  }),
  requirePermission(USER_PERMISSION_PERMISSIONS.delete),
  validate({ params: uuidChildParamSchema }),
  rbacUserAccessController.revokeGrant,
);
