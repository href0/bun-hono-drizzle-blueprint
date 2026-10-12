import { beforeEach, describe, expect, it } from 'bun:test';
import {
  authRefreshTokens,
  type AuthRefreshToken,
  type NewAuthRefreshToken,
} from '../../database/schema';
import { parseInstant } from '../../utils/datetime.util';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';
import { AuthRepository } from './auth.repository';

const COLUMNS =
  '"id", "user_id", "family_id", "token_hash", "expires_at", "family_started_at", "revoked_at", "replaced_by_id", "user_agent", "ip", "created_at"';

describe('AuthRepository (Unit)', () => {
  const token: AuthRefreshToken = {
    id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d01',
    userId: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    familyId: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d02',
    tokenHash: 'a'.repeat(64),
    expiresAt: parseInstant('2026-10-19T03:00:00Z'),
    familyStartedAt: parseInstant('2026-10-12T03:00:00Z'),
    revokedAt: null,
    replacedById: null,
    userAgent: 'test-agent',
    ip: '203.0.113.7',
    createdAt: parseInstant('2026-10-12T03:00:00Z'),
  };

  /** What the service passes in: the database fills revoked_at, replaced_by_id and created_at. */
  const input: NewAuthRefreshToken = {
    id: token.id,
    userId: token.userId,
    familyId: token.familyId,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
    familyStartedAt: token.familyStartedAt,
    userAgent: token.userAgent,
    ip: token.ip,
  };

  const recorder = createSqlRecorder();
  const repo = new AuthRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('insert stores the row and returns it', async () => {
    recorder.respondWith([rowOf(authRefreshTokens, token)]);
    expect(await repo.insert(input)).toEqual(token);
    expect(recorder.statements.at(0)?.sql).toStartWith('insert into "auth_refresh_tokens"');
    expect(recorder.statements.at(0)?.params).toEqual([
      token.id,
      token.userId,
      token.familyId,
      token.tokenHash,
      '2026-10-19T03:00:00Z',
      '2026-10-12T03:00:00Z',
      'test-agent',
      '203.0.113.7',
    ]);
  });

  it('insert without a returned row is a broken invariant', async () => {
    expect(repo.insert(input)).rejects.toThrow('INSERT INTO auth_refresh_tokens returned no rows');
  });

  it('finds a token by hash, locked FOR UPDATE for rotation', async () => {
    recorder.respondWith([rowOf(authRefreshTokens, token)], []);

    expect(await repo.findByHashForUpdate(token.tokenHash)).toEqual(token);
    expect(await repo.findByHash(token.tokenHash)).toBeNull();
    expect(recorder.statements).toEqual([
      {
        sql: `select ${COLUMNS} from "auth_refresh_tokens" where "auth_refresh_tokens"."token_hash" = $1 limit $2 for update`,
        params: [token.tokenHash, 1],
      },
      {
        sql: `select ${COLUMNS} from "auth_refresh_tokens" where "auth_refresh_tokens"."token_hash" = $1 limit $2`,
        params: [token.tokenHash, 1],
      },
    ]);
  });

  it('revokes with the database clock and only touches usable tokens', async () => {
    await repo.markRotated(token.id, 'successor-id');
    await repo.revokeFamily(token.familyId);
    await repo.revokeAllForUser(token.userId);

    expect(recorder.statements).toEqual([
      {
        sql: 'update "auth_refresh_tokens" set "revoked_at" = now(), "replaced_by_id" = $1 where ("auth_refresh_tokens"."id" = $2 and "auth_refresh_tokens"."revoked_at" is null)',
        params: ['successor-id', token.id],
      },
      {
        sql: 'update "auth_refresh_tokens" set "revoked_at" = now() where ("auth_refresh_tokens"."family_id" = $1 and "auth_refresh_tokens"."revoked_at" is null)',
        params: [token.familyId],
      },
      {
        sql: 'update "auth_refresh_tokens" set "revoked_at" = now() where ("auth_refresh_tokens"."user_id" = $1 and "auth_refresh_tokens"."revoked_at" is null)',
        params: [token.userId],
      },
    ]);
  });
});
