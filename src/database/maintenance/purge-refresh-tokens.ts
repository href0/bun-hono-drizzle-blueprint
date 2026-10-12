import { lt } from 'drizzle-orm';
import type { Temporal } from 'temporal-polyfill';
import { nowInstant } from '../../utils/datetime.util';
import { authRefreshTokens } from '../schema';
import { defaultTxHost, type TransactionHost } from '../transaction-host';

/** Default retention after expiry: a few days of history for support and incident review. */
export const DEFAULT_RETENTION_DAYS = 7;

/**
 * Deletes refresh tokens that expired more than `retentionDays` ago (`bun run auth:purge-tokens`,
 * run it from a scheduler, e.g. daily). Without it `auth_refresh_tokens` grows by one row per login
 * and per refresh, forever.
 *
 * Safe for rotation and reuse detection: an expired token can never be refreshed again, and a
 * rotated token always expires before its successor, so only dead rows go. Deliberately not a
 * foreign key, `replaced_by_id` lets rows of one family be removed in any order. Returns the count.
 */
export const purgeRefreshTokens = async (
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  txHost: TransactionHost = defaultTxHost,
  now: Temporal.Instant = nowInstant(),
): Promise<number> => {
  if (!Number.isInteger(retentionDays) || retentionDays < 0) {
    throw new RangeError(`retentionDays must be a whole number ≥ 0, got ${String(retentionDays)}`);
  }
  const cutoff = now.subtract({ hours: retentionDays * 24 });
  const deleted = await txHost.tx
    .delete(authRefreshTokens)
    .where(lt(authRefreshTokens.expiresAt, cutoff))
    .returning({ id: authRefreshTokens.id });
  return deleted.length;
};
