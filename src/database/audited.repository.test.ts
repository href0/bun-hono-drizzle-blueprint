import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { runWithRequestContext } from '../core/context/request-context';
import { AuditedRepository } from './audited.repository';
import { users, type User } from './schema';
import type { TransactionHost } from './transaction-host';
import { createSqlRecorder, rowOf } from '../../test/helpers/sql-recorder';

/**
 * The primitives composed the way BaseRepository (plan step 2.5) will: lock → diff → update →
 * audit, and lock → snapshot → delete → audit.
 */
class AuditedUsers extends AuditedRepository<typeof users> {
  constructor(txHost: TransactionHost) {
    super(users, txHost, { redact: ['passwordHash'] });
  }

  async updateById(id: string, patch: Partial<User>, failAfterAudit = false): Promise<User | null> {
    return this.inTransaction(async () => {
      const before = await this.lockById(id);
      if (!before) return null;
      const changes = this.diff(before, patch);
      if (Object.keys(changes).length === 0) return before;
      await this.txHost.tx.update(users).set(patch).where(eq(users.id, id));
      await this.writeChange('UPDATE', id, changes);
      if (failAfterAudit) throw new Error('failure after the audit row');
      return { ...before, ...patch };
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.inTransaction(async () => {
      const before = await this.lockById(id);
      if (!before) return;
      await this.txHost.tx.delete(users).where(eq(users.id, id));
      await this.writeChange('DELETE', id, this.snapshot(before));
    });
  }

  lockOutsideTransaction(id: string): Promise<User | null> {
    return this.lockById(id);
  }

  /** A detail row's change, recorded with its header (what ChildRepository will do). */
  async writeDetailChange(detailId: string, headerId: string): Promise<boolean> {
    return this.inTransaction(() =>
      this.writeChange('DELETE', detailId, { id: detailId }, { table: users, id: headerId }),
    );
  }

  writeOutsideTransaction(): Promise<boolean> {
    return this.writeChange('UPDATE', 'x', { name: { from: 'a', to: 'b' } });
  }
}

const USER: User = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  email: 'audit@example.com',
  fullName: 'Before',
  passwordHash: 'old-hash',
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
};

const INSERT_AUDIT =
  'insert into "record_changes" ("id", "changed_at", "table_name", "record_id", "action", "changes", "actor", "request_id", "parent_table", "parent_id") values (default, default, $1, $2, $3, $4, $5, $6, $7, $8)';

const kinds = (sqls: string[]): string[] =>
  sqls.map((sql) =>
    sql
      .split(' ')
      .slice(0, sql.startsWith('insert') ? 3 : 1)
      .join(' '),
  );

describe('AuditedRepository', () => {
  const recorder = createSqlRecorder();
  const repository = new AuditedUsers(recorder.txHost);
  const sqls = (): string[] => recorder.statements.map((statement) => statement.sql);

  beforeEach(() => {
    recorder.reset();
  });

  it('locks the row, updates it and writes the changed columns in one transaction', async () => {
    recorder.respondWith([rowOf(users, USER)]);

    await repository.updateById(USER.id, { fullName: 'After', isActive: true });

    expect(kinds(sqls())).toEqual([
      'BEGIN',
      'select',
      'update',
      'insert into "record_changes"',
      'COMMIT',
    ]);
    expect(recorder.statements.at(1)?.sql).toEndWith(
      'where "users"."id" = $1 order by "users"."id" for update',
    );
    expect(recorder.statements.at(3)).toEqual({
      sql: INSERT_AUDIT,
      params: [
        'users',
        USER.id,
        'UPDATE',
        JSON.stringify({ full_name: { from: 'Before', to: 'After' } }),
        'system',
        null,
        null,
        null,
      ],
    });
  });

  it('writes nothing when the update changes nothing', async () => {
    recorder.respondWith([rowOf(users, USER)]);

    const result = await repository.updateById(USER.id, { fullName: 'Before' });

    expect(result).toEqual(USER);
    expect(kinds(sqls())).toEqual(['BEGIN', 'select', 'COMMIT']);
  });

  it('rolls the audit row back with the change when the transaction fails', async () => {
    recorder.respondWith([rowOf(users, USER)]);

    const update = repository.updateById(USER.id, { fullName: 'After' }, true);

    expect(update).rejects.toThrow('failure after the audit row');
    await update.catch(() => undefined);
    expect(kinds(sqls())).toEqual([
      'BEGIN',
      'select',
      'update',
      'insert into "record_changes"',
      'ROLLBACK',
    ]);
  });

  it('records a redacted column as changed without its values', async () => {
    recorder.respondWith([rowOf(users, USER)]);

    await repository.updateById(USER.id, { passwordHash: 'new-hash' });

    expect(recorder.statements.at(3)?.params[3]).toBe(
      JSON.stringify({ password_hash: { from: '[REDACTED]', to: '[REDACTED]' } }),
    );
  });

  it('does not diff updated_at', async () => {
    recorder.respondWith([rowOf(users, USER)]);

    await repository.updateById(USER.id, {
      updatedAt: Temporal.Instant.from('2026-10-06T00:00:00Z'),
    });

    expect(kinds(sqls())).toEqual(['BEGIN', 'select', 'COMMIT']);
  });

  it('takes actor and request id from the request context', async () => {
    recorder.respondWith([rowOf(users, USER)]);

    await runWithRequestContext(
      { requestId: 'req-audit', locale: 'en', clientIp: '127.0.0.1', actor: 'user:42' },
      () => repository.updateById(USER.id, { fullName: 'After' }),
    );

    expect(recorder.statements.at(3)?.params.slice(4, 6)).toEqual(['user:42', 'req-audit']);
  });

  it('stores the whole row, redacted, before a hard delete', async () => {
    recorder.respondWith([rowOf(users, USER)]);

    await repository.deleteById(USER.id);

    expect(kinds(sqls())).toEqual([
      'BEGIN',
      'select',
      'delete',
      'insert into "record_changes"',
      'COMMIT',
    ]);
    expect(JSON.parse(recorder.statements.at(3)?.params[3] as string)).toEqual({
      id: USER.id,
      email: USER.email,
      full_name: 'Before',
      password_hash: '[REDACTED]',
      is_active: true,
      created_at: '2026-10-05T03:00:00Z',
      updated_at: '2026-10-05T03:00:00Z',
    });
    expect(recorder.statements.at(3)?.params[2]).toBe('DELETE');
  });

  it('records the header of a detail row in parent_table / parent_id', async () => {
    await repository.writeDetailChange('detail-1', USER.id);

    expect(recorder.statements.at(1)?.params).toEqual([
      'users',
      'detail-1',
      'DELETE',
      JSON.stringify({ id: 'detail-1' }),
      'system',
      null,
      'users',
      USER.id,
    ]);
  });

  it('does nothing more when the row does not exist', async () => {
    expect(await repository.updateById(USER.id, { fullName: 'After' })).toBeNull();
    expect(kinds(sqls())).toEqual(['BEGIN', 'select', 'COMMIT']);
  });

  it('refuses to lock or write the audit outside a transaction', async () => {
    expect(repository.lockOutsideTransaction(USER.id)).rejects.toThrow(
      'users: lockById() must run inside a transaction',
    );
    expect(repository.writeOutsideTransaction()).rejects.toThrow(
      'users: writeChange() must run inside a transaction',
    );
    await Promise.allSettled([
      repository.lockOutsideTransaction(USER.id),
      repository.writeOutsideTransaction(),
    ]);
    expect(recorder.statements).toEqual([]);
  });
});
