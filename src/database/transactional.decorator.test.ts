import { describe, expect, it, mock } from 'bun:test';
import { db } from './connection';
import { defaultTxHost, transactionStorage } from './transaction-host';
import { runInTransaction, Transactional } from './transactional.decorator';

describe('Transactional (Unit)', () => {
  const mockTx = { isMockTransaction: true } as any;

  it('runInTransaction should open a database transaction and expose it through TransactionHost', async () => {
    // `db` may be the real Drizzle instance or a module mock from another test file:
    // patch the method on the instance and restore it afterwards in both cases.
    const target = db as unknown as Record<string, unknown>;
    const hadOwnTransaction = Object.hasOwn(target, 'transaction');
    const originalTransaction = target.transaction;
    const transaction = mock((callback: (tx: unknown) => Promise<unknown>) => callback(mockTx));
    target.transaction = transaction;

    try {
      const seen = await runInTransaction(() => Promise.resolve(defaultTxHost.tx));

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(seen).toBe(mockTx);
    } finally {
      if (hadOwnTransaction) target.transaction = originalTransaction;
      else delete target.transaction;
    }
  });

  it('runInTransaction should reuse the active transaction instead of opening a nested one', async () => {
    const seen = await transactionStorage.run(mockTx, () =>
      runInTransaction(() => Promise.resolve(defaultTxHost.tx)),
    );

    expect(seen).toBe(mockTx);
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
