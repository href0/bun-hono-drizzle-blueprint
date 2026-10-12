import { describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import { parseInstant } from '../../utils/datetime.util';
import { authRefreshTokens } from '../schema';
import { purgeRefreshTokens } from './purge-refresh-tokens';

describe('purgeRefreshTokens', () => {
  const now = parseInstant('2026-10-12T00:00:00Z');

  it('deletes only tokens that expired more than the retention ago', async () => {
    const recorder = createSqlRecorder();
    recorder.respondWith([{ id: 'a' }, { id: 'b' }].map((row) => [row.id]));

    expect(await purgeRefreshTokens(7, recorder.txHost, now)).toBe(2);
    expect(recorder.statements).toEqual([
      {
        sql: 'delete from "auth_refresh_tokens" where "auth_refresh_tokens"."expires_at" < $1 returning "id"',
        params: ['2026-10-05T00:00:00Z'],
      },
    ]);
    expect(authRefreshTokens.expiresAt.name).toBe('expires_at');
  });

  it('refuses a negative or fractional retention', async () => {
    const recorder = createSqlRecorder();
    expect(purgeRefreshTokens(-1, recorder.txHost, now)).rejects.toThrow('whole number');
    expect(purgeRefreshTokens(1.5, recorder.txHost, now)).rejects.toThrow('whole number');
    expect(recorder.statements).toEqual([]);
  });
});
