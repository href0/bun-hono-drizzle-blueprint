import { describe, expect, it } from 'bun:test';
import { getRequestContext, runWithRequestContext } from '../core/context/request-context';
import {
  afterCommit,
  defaultTxHost,
  runInFakeTransaction,
  TransactionHost,
  transactionStorage,
} from './transaction-host';
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

describe('afterCommit (D63, R88)', () => {
  /** The statements so far, plus `AFTER` where queued work ran. */
  const trace = (recorder: ReturnType<typeof createSqlRecorder>, log: string[]) => () => {
    log.push(...recorder.statements.splice(0).map((statement) => statement.sql), 'AFTER');
    return Promise.resolve();
  };

  it('runs at once outside a transaction', async () => {
    const log: string[] = [];
    await afterCommit(() => {
      log.push('ran');
      return Promise.resolve();
    });
    expect(log).toEqual(['ran']);
  });

  it('runs after the outermost commit — also work queued by a joined, nested run', async () => {
    const recorder = createSqlRecorder();
    const log: string[] = [];

    const result = await recorder.txHost.run(async () => {
      await afterCommit(trace(recorder, log));
      await recorder.txHost.run(() => afterCommit(trace(recorder, log)));
      expect(log).toEqual([]);
      return 'done';
    });

    expect(result).toBe('done');
    expect(log).toEqual(['BEGIN', 'COMMIT', 'AFTER', 'AFTER']);
  });

  it('never runs after a rollback', async () => {
    const recorder = createSqlRecorder();
    const log: string[] = [];

    const failure = await recorder.txHost
      .run(async () => {
        await afterCommit(trace(recorder, log));
        throw new Error('refused');
      })
      .catch((error: unknown) => error);

    expect(failure).toEqual(new Error('refused'));
    expect(log).toEqual([]);
    await recorder.txHost.run(() => Promise.resolve());
    expect(log).toEqual([]);
  });

  it('logs work that fails after the commit instead of failing the committed change', async () => {
    const recorder = createSqlRecorder();
    const log: string[] = [];

    await recorder.txHost.run(async () => {
      await afterCommit(() => Promise.reject(new Error('cache down')));
      await afterCommit(trace(recorder, log));
    });

    expect(log).toEqual(['BEGIN', 'COMMIT', 'AFTER']);
  });

  it('runInFakeTransaction: the stand-in commits when fn succeeds, drops the work when it throws', async () => {
    const log: string[] = [];
    const queue = () =>
      afterCommit(() => {
        log.push('ran');
        return Promise.resolve();
      });

    expect(
      await runInFakeTransaction({}, async () => {
        await queue();
        expect(log).toEqual([]);
        return 1;
      }),
    ).toBe(1);
    expect(log).toEqual(['ran']);

    const fake = {};
    const failure = await runInFakeTransaction(fake, async () => {
      await queue();
      throw new Error('refused');
    }).catch((error: unknown) => error);
    expect(failure).toEqual(new Error('refused'));
    await runInFakeTransaction(fake, () => Promise.resolve());
    expect(log).toEqual(['ran']);
  });
});
