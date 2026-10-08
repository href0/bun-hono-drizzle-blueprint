import { AsyncLocalStorage } from 'node:async_hooks';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db, type DrizzleDatabase } from './connection';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgTransaction generics differ per driver/schema; any transaction must be accepted
export type DrizzleTxOrDb = DrizzleDatabase | PgTransaction<any, any, any>;

export const transactionStorage = new AsyncLocalStorage<DrizzleTxOrDb>();

export class TransactionHost {
  /** `root` is the connection used outside a transaction; tests inject a recording one. */
  constructor(private readonly root: DrizzleDatabase = db) {}

  /**
   * Returns current active transaction client if inside @Transactional() / runInTransaction,
   * otherwise returns the root connection.
   */
  get tx(): DrizzleTxOrDb {
    return transactionStorage.getStore() ?? this.root;
  }

  /**
   * Runs `fn` in a transaction on the root connection (commit on success, rollback on throw).
   * Inside an active transaction `fn` joins it instead of opening a nested one.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (transactionStorage.getStore()) {
      return fn();
    }
    return this.root.transaction(async (tx) => transactionStorage.run(tx, fn));
  }
}

export const defaultTxHost = new TransactionHost();
