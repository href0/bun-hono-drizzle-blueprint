import { char, index, uuid, varchar } from 'drizzle-orm/pg-core';
import { instant, NOW, parentReference, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';
import { users } from './users.schema';

/**
 * Refresh tokens (D1; docs/standards/auth-and-inbound.md §2): opaque values, stored only as their SHA-256. Every refresh revokes
 * the presented token and issues a new one in the same family (`family_id` = one login session);
 * presenting a revoked token again revokes the whole family (reuse detection).
 *
 * Approved exception to the audited data layer (docs/decisions.md §2):
 * high-volume security state whose own columns are the trail (`revoked_at`, `replaced_by_id`), so it has no audit columns or
 * soft delete, and its repository may update it directly (eslint.config.mjs, auth repository).
 */
export const authRefreshTokens = appTable(
  'auth_refresh_tokens',
  {
    id: uuidPrimaryKey(),
    userId: parentReference('user_id', () => users.id),
    familyId: uuid('family_id').notNull(),
    /** `sha256Hex(token)`; the token itself is never stored. */
    tokenHash: char('token_hash', { length: 64 }).notNull().unique('auth_refresh_tokens_hash_uq'),
    /** `min(now + REFRESH_TOKEN_TTL, family_started_at + REFRESH_TOKEN_ABSOLUTE_TTL)`. */
    expiresAt: instant('expires_at').notNull(),
    familyStartedAt: instant('family_started_at').notNull(),
    /** Null = usable. Set on rotation, logout, reuse detection or when the user is deactivated. */
    revokedAt: instant('revoked_at'),
    /**
     * The token issued by the rotation that revoked this one. Deliberately not a foreign key:
     * expired families can then be purged in any order.
     */
    replacedById: uuid('replaced_by_id'),
    userAgent: varchar('user_agent', { length: 255 }),
    /** Client IP as resolved by the clientIp middleware (IPv6 fits in 45 characters). */
    ip: varchar('ip', { length: 45 }),
    createdAt: instant('created_at').notNull().default(NOW),
  },
  (table) => [
    index('auth_refresh_tokens_user_idx').on(table.userId),
    index('auth_refresh_tokens_family_idx').on(table.familyId),
  ],
);

export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type NewAuthRefreshToken = typeof authRefreshTokens.$inferInsert;
