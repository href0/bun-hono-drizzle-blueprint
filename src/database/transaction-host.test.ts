import { describe, expect, it } from 'bun:test';
import { getRequestContext, runWithRequestContext } from '../core/context/request-context';
import { defaultTxHost, TransactionHost, transactionStorage } from './transaction-host';
import { db } from './connection';
import { createSqlRecorder } from '../../test/helpers/sql-recorder';

describe('TransactionHost (Unit)', () => {
  it('should return base db instance outside of transaction context', () => {
    const host = new TransactionHost();
    expect(host.tx).toBe(db);
    expect(defaultTxHost.tx).toBe(db);
  });

  it('should return context transaction client when executed inside transactionStorage', () => {
    const mockTx = { isMockTransaction: true } as any;

    transactionStorage.run(mockTx, () => {
      const host = new TransactionHost();
      expect(host.tx).toBe(mockTx);
    });

    expect(defaultTxHost.tx).toBe(db);
  });

  it('should use the injected root connection outside a transaction', () => {
    const recorder = createSqlRecorder();

    expect(recorder.txHost.tx).toBe(recorder.db);
  });

  it('run should commit on success and expose the transaction through tx', async () => {
    const recorder = createSqlRecorder();

    const seen = await recorder.txHost.run(() => Promise.resolve(recorder.txHost.tx));

    expect(seen).not.toBe(recorder.db);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(recorder.txHost.tx).toBe(recorder.db);
  });

  it('run should roll back and rethrow when the callback fails', async () => {
    const recorder = createSqlRecorder();
    const failure = new Error('boom');

    const run = recorder.txHost.run(() => Promise.reject(failure));

    expect(run).rejects.toBe(failure);
    await run.catch(() => undefined);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('run should join the active transaction instead of opening a nested one', async () => {
    const recorder = createSqlRecorder();

    await recorder.txHost.run(() => recorder.txHost.run(() => Promise.resolve()));

    expect(recorder.statements.map((statement) => statement.sql)).toEqual(['BEGIN', 'COMMIT']);
  });

  it('should nest independently with the request context across async boundaries', async () => {
    const mockTx = { isMockTransaction: true } as any;

    await runWithRequestContext(
      { requestId: 'req-tx', locale: 'id', clientIp: '127.0.0.1', actor: 'system' },
      () =>
        transactionStorage.run(mockTx, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          expect(defaultTxHost.tx).toBe(mockTx);
          expect(getRequestContext()?.requestId).toBe('req-tx');
        }),
    );
  });
});
