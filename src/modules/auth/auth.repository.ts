import { and, eq, isNull } from 'drizzle-orm';
import { InternalServerError } from '../../core/errors';
import { defaultTxHost, type TransactionHost } from '../../database';
import { NOW } from '../../database/schema/columns';
import {
  authRefreshTokens,
  type AuthRefreshToken,
  type NewAuthRefreshToken,
} from '../../database/schema';

/**
 * Refresh tokens (`auth_refresh_tokens`) — the approved exception to the audited data layer
 * (plan 4.1, eslint.config.mjs `AUTH_TOKEN_REPOSITORY_RULES`): no repository base and direct
 * UPDATEs, because the table's own `revoked_at` / `replaced_by_id` are the trail. Tokens are never
 * deleted here; revocation sets `revoked_at` (database clock).
 */
export class AuthRepository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async insert(token: NewAuthRefreshToken): Promise<AuthRefreshToken> {
    const rows = await this.txHost.tx.insert(authRefreshTokens).values(token).returning();
    const row = rows.at(0);
    if (!row) throw new InternalServerError('INSERT INTO auth_refresh_tokens returned no rows');
    return row;
  }

  /** The token row with this hash, locked until the transaction ends (rotation is serialized). */
  async findByHashForUpdate(tokenHash: string): Promise<AuthRefreshToken | null> {
    const rows = await this.txHost.tx
      .select()
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.tokenHash, tokenHash))
      .limit(1)
      .for('update');
    return rows.at(0) ?? null;
  }

  async findByHash(tokenHash: string): Promise<AuthRefreshToken | null> {
    const rows = await this.txHost.tx
      .select()
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.tokenHash, tokenHash))
      .limit(1);
    return rows.at(0) ?? null;
  }

  /** Marks a rotated token as used, pointing to its successor. */
  async markRotated(id: string, replacedById: string): Promise<void> {
    await this.txHost.tx
      .update(authRefreshTokens)
      .set({ revokedAt: NOW, replacedById })
      .where(and(eq(authRefreshTokens.id, id), isNull(authRefreshTokens.revokedAt)));
  }

  /** Revokes every still-usable token of one session (login → rotations). */
  async revokeFamily(familyId: string): Promise<void> {
    await this.txHost.tx
      .update(authRefreshTokens)
      .set({ revokedAt: NOW })
      .where(and(eq(authRefreshTokens.familyId, familyId), isNull(authRefreshTokens.revokedAt)));
  }

  /** Revokes every still-usable token of the user (all sessions, all devices). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.txHost.tx
      .update(authRefreshTokens)
      .set({ revokedAt: NOW })
      .where(and(eq(authRefreshTokens.userId, userId), isNull(authRefreshTokens.revokedAt)));
  }
}

export const authRepository = new AuthRepository();
