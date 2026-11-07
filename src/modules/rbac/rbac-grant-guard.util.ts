import { getRequestContext } from '../../core/context/request-context';
import { APP_ERROR_CODES, ForbiddenError } from '../../core/errors';
import { RBAC_MESSAGES } from './rbac.messages';

const escalationForbidden = (): ForbiddenError =>
  new ForbiddenError(RBAC_MESSAGES.PERMISSION_ESCALATION, {
    code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
  });

/**
 * Stops privilege escalation (plan RBAC step 6): whoever changes access may only give what they
 * hold themselves — every key of `keys` must be among the signed-in user's effective permissions,
 * or they are a super admin; otherwise 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`. Without a signed-in
 * user (seeds, jobs: actor `system`) nothing is checked; a request without `permissionContext()`
 * is refused (fail closed).
 */
export const requireActorHolds = async (keys: readonly string[]): Promise<void> => {
  const context = getRequestContext();
  if (!context?.user) return;
  const resolve = context.permissions;
  if (resolve === undefined) throw escalationForbidden();
  const effective = await resolve();
  if (effective.superAdmin) return;
  if (keys.some((key) => !effective.permissions.includes(key))) throw escalationForbidden();
};
