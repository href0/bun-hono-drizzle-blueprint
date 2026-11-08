import { Temporal } from 'temporal-polyfill';
import { ValidationError } from '../../core/errors';
import type { ChangedItem, GrantItem } from './rbac-replace.dto';
import { RBAC_MESSAGES } from './rbac.messages';

/** What a replace changes (D72): ids to add, to remove and to keep — compared, never rewritten. */
export interface IdDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

/**
 * The body of a replace is the wanted set; `current` the live rows. Only the difference is written,
 * so unchanged rows keep their id, history and audit trail. Order follows the inputs.
 */
export const diffIds = (current: readonly string[], wanted: readonly string[]): IdDiff => {
  const now = new Set(current);
  const want = new Set(wanted);
  return {
    added: [...want].filter((id) => !now.has(id)),
    removed: [...now].filter((id) => !want.has(id)),
    unchanged: [...want].filter((id) => now.has(id)),
  };
};

export const changedItem = ({ id, key }: { id: string; key: string }): ChangedItem => ({ id, key });

/**
 * 400 when some of `ids` were not `found`: one detail per refused id at `fieldOf(id)` — its place
 * in the request body — so the frontend can mark it.
 */
export const refuseUnknown = (
  ids: readonly string[],
  found: readonly { id: string }[],
  fieldOf: (id: string) => string,
  message: (typeof RBAC_MESSAGES)[keyof typeof RBAC_MESSAGES],
): void => {
  const known = new Set(found.map(({ id }) => id));
  const refused = ids.filter((id) => !known.has(id));
  if (refused.length > 0) {
    throw new ValidationError(undefined, {
      details: refused.map((id) => ({ field: fieldOf(id), message })),
    });
  }
};

/**
 * Does the live grant already have the expiry and note `want` asks for (absent = none)? Expiries
 * compare to the millisecond: the API sends them with milliseconds (`toIsoUtc`) while PostgreSQL
 * keeps microseconds, so a grant read and sent back as it is must count as unchanged.
 */
export const sameGrant = (
  grant: { expiresAt: Temporal.Instant | null; note: string | null },
  want: GrantItem,
): boolean => {
  const expiresAt = want.expiresAt ?? null;
  const sameExpiry =
    expiresAt === null || grant.expiresAt === null
      ? expiresAt === grant.expiresAt
      : expiresAt.epochMilliseconds === grant.expiresAt.epochMilliseconds;
  return sameExpiry && (want.note ?? null) === grant.note;
};
