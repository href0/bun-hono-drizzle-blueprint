import { describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import { parseInstant } from '../../utils/datetime.util';
import { authRefreshTokens } from '../schema';
import { countPurgeableRefreshTokens, purgeRefreshTokens } from './purge-refresh-tokens';

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
    expect(countPurgeableRefreshTokens(-1, recorder.txHost, now)).rejects.toThrow('whole number');
    expect(recorder.statements).toEqual([]);
  });
});

describe('countPurgeableRefreshTokens', () => {
  const now = parseInstant('2026-10-12T00:00:00Z');

  it('counts with the criterion of the purge, deleting nothing', async () => {
    const recorder = createSqlRecorder();
    recorder.respondWith([[3]]);

    expect(await countPurgeableRefreshTokens(7, recorder.txHost, now)).toBe(3);
    expect(recorder.statements).toEqual([
      {
        sql: 'select count(*) from "auth_refresh_tokens" where "auth_refresh_tokens"."expires_at" < $1',
        params: ['2026-10-05T00:00:00Z'],
      },
    ]);
  });

  it('no row: zero', async () => {
    const recorder = createSqlRecorder();
    recorder.respondWith([]);
    expect(await countPurgeableRefreshTokens(0, recorder.txHost, now)).toBe(0);
  });
});
