import { getRequestContext } from '../context/request-context';
import { APP_ERROR_CODES, ForbiddenError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import type { EffectivePermissions } from './rbac';

const escalationForbidden = (): ForbiddenError =>
  new ForbiddenError(I18N_MESSAGES.ACCOUNT_ESCALATION_FORBIDDEN, {
    code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
  });

/**
 * Whoever changes another user's account — email, name, password, active flag, delete, restore —
 * must hold at least what that user holds: otherwise resetting a stronger user's password and
 * signing in as them would be a way round the RBAC escalation rules (D69). A super
 * admin's account is changed only by a super admin. Refused with 403
 * `ERR_PERMISSION_ESCALATION_FORBIDDEN`. One's own account is always allowed; without a signed-in
 * user (seeds, jobs: actor `system`) nothing is checked; a request without `permissionContext()`
 * is refused (fail closed). Returns the target's effective permissions (`undefined` when nothing
 * was checked).
 */
export const requireMayManageUser = async (
  targetId: string,
): Promise<EffectivePermissions | undefined> => {
  const context = getRequestContext();
  const actor = context?.user;
  if (!context || !actor) return undefined;
  const { permissions, permissionsOf } = context;
  if (permissions === undefined || permissionsOf === undefined) throw escalationForbidden();
  const target = await permissionsOf(targetId);
  if (actor.id === targetId) return target;
  const own = await permissions();
  if (own.superAdmin) return target;
  if (target.superAdmin || target.permissions.some((key) => !own.permissions.includes(key))) {
    throw escalationForbidden();
  }
  return target;
};
