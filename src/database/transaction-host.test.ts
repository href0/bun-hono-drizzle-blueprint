import { describe, expect, it } from 'bun:test';
import { getRequestContext, runWithRequestContext } from '../core/context/request-context';
import { defaultTxHost, TransactionHost, transactionStorage } from './transaction-host';
import { db } from './connection';

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

  it('should nest independently with the request context across async boundaries', async () => {
    const mockTx = { isMockTransaction: true } as any;

    await runWithRequestContext({ requestId: 'req-tx', locale: 'id', actor: 'system' }, () =>
      transactionStorage.run(mockTx, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        expect(defaultTxHost.tx).toBe(mockTx);
        expect(getRequestContext()?.requestId).toBe('req-tx');
      }),
    );
  });
});
