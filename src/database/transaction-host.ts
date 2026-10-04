import { AsyncLocalStorage } from 'node:async_hooks';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db, type DrizzleDatabase } from './connection';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgTransaction generics differ per driver/schema; any transaction must be accepted
export type DrizzleTxOrDb = DrizzleDatabase | PgTransaction<any, any, any>;

export const transactionStorage = new AsyncLocalStorage<DrizzleTxOrDb>();

export class TransactionHost {
  /**
   * Returns current active transaction client if inside @Transactional() / runInTransaction,
   * otherwise returns default connection pool client.
   */
  get tx(): DrizzleTxOrDb {
    return transactionStorage.getStore() ?? db;
  }
}

export const defaultTxHost = new TransactionHost();
