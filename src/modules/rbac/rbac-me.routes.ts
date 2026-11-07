import { Hono } from 'hono';
import { allowAnyUser } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { rbacUserAccessController } from './rbac-user-access.controller';
import { myPermissionsResponseSchema } from './rbac-user-access.dto';
import { RBAC_MESSAGES } from './rbac.messages';

/** `/me`: what the signed-in user may do, for the frontend's menus and buttons (D48). */
export const rbacMeRouter = new Hono();

rbacMeRouter.get(
  '/permissions',
  describeEndpoint({
    tags: ['User access'],
    summary: 'My permissions (API and menu keys)',
    description:
      'Read per request: a change of roles or permissions shows on the next call, no new login needed. The server still checks every endpoint itself.',
    response: {
      status: 200,
      description: 'The permissions of the signed-in user',
      message: RBAC_MESSAGES.MY_PERMISSIONS_RETRIEVED,
      data: myPermissionsResponseSchema,
    },
  }),
  allowAnyUser(),
  rbacUserAccessController.myPermissions,
);
