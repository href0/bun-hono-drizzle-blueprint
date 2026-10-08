import { describe, expect, it } from 'bun:test';
import { defaultTxHost, transactionStorage } from './transaction-host';
import { runInTransaction, Transactional } from './transactional.decorator';
import { createSqlRecorder } from '../../test/helpers/sql-recorder';

describe('Transactional (Unit)', () => {
  const mockTx = { isMockTransaction: true } as any;

  it('runInTransaction should reuse the active transaction instead of opening a nested one', async () => {
    const seen = await transactionStorage.run(mockTx, () =>
      runInTransaction(() => Promise.resolve(defaultTxHost.tx)),
    );

    expect(seen).toBe(mockTx);
  });

  it('runInTransaction should join a transaction opened by any TransactionHost', async () => {
    const recorder = createSqlRecorder();

    await recorder.txHost.run(() => runInTransaction(() => recorder.txHost.tx.execute('select 1')));

    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      'BEGIN',
      'select 1',
      'COMMIT',
    ]);
  });

  it('@Transactional() should run the method inside the active transaction and keep `this`', async () => {
    class SampleService {
      readonly name = 'sample';

      @Transactional()
      async work(suffix: string): Promise<{ label: string; tx: unknown }> {
        return Promise.resolve({ label: `${this.name}-${suffix}`, tx: defaultTxHost.tx });
      }
    }

    const result = await transactionStorage.run(mockTx, () => new SampleService().work('ok'));

    expect(result).toEqual({ label: 'sample-ok', tx: mockTx });
  });
});
