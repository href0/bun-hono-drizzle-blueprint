import { getRequestContext } from '../../core/context/request-context';
import { APP_ERROR_CODES, ForbiddenError } from '../../core/errors';
import { RBAC_MESSAGES } from './rbac.messages';

/** 403 escalation; `missing` = the permission keys the caller lacks, one detail each (`field` = key). */
const escalationForbidden = (missing: readonly string[] = []): ForbiddenError =>
  new ForbiddenError(RBAC_MESSAGES.PERMISSION_ESCALATION, {
    code: APP_ERROR_CODES.PERMISSION_ESCALATION_FORBIDDEN,
    details: missing.map((key) => ({
      field: key,
      verbatimField: true,
      message: RBAC_MESSAGES.PERMISSION_NOT_HELD,
    })),
  });

/** The signed-in user's id, if the current request has one (seeds and jobs have none). */
export const actorUserId = (): string | undefined => getRequestContext()?.user?.id;

/**
 * Only a super admin gives or takes the role `super_admin` (D69): anyone else → 403
 * `ERR_PERMISSION_ESCALATION_FORBIDDEN`. Without a signed-in user (seeds, jobs) nothing is checked;
 * a request without `permissionContext()` is refused (fail closed).
 */
export const requireActorIsSuperAdmin = async (): Promise<void> => {
  const context = getRequestContext();
  if (!context?.user) return;
  const resolve = context.permissions;
  if (resolve === undefined || !(await resolve()).superAdmin) throw escalationForbidden();
};

/**
 * Whether the signed-in user may give or take `super_admin` (D69) — the answer
 * `requireActorIsSuperAdmin` enforces: true without a signed-in user (seeds, jobs), false when the
 * request has no `permissionContext()` (fail closed).
 */
export const actorIsSuperAdmin = async (): Promise<boolean> => {
  const context = getRequestContext();
  if (!context?.user) return true;
  const resolve = context.permissions;
  return resolve !== undefined && (await resolve()).superAdmin;
};

/**
 * Which permission keys the signed-in user may give or take (D69, D73) — `grantable` of the
 * checklist catalog, the same answer `requireActorHolds` enforces: every key without a signed-in
 * user (seeds, jobs) or for a super admin, only the held ones otherwise, none when the request has
 * no `permissionContext()` (fail closed).
 */
export const actorCanGive = async (): Promise<(key: string) => boolean> => {
  const context = getRequestContext();
  if (!context?.user) return () => true;
  const resolve = context.permissions;
  if (resolve === undefined) return () => false;
  const effective = await resolve();
  if (effective.superAdmin) return () => true;
  const held = new Set(effective.permissions);
  return (key) => held.has(key);
};

/**
 * Stops privilege escalation (D69, D74): whoever changes access may only give or take what they
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
  const missing = keys.filter((key) => !effective.permissions.includes(key));
  if (missing.length > 0) throw escalationForbidden(missing);
};
