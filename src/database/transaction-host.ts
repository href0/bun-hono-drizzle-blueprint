import { AsyncLocalStorage } from 'node:async_hooks';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { logger } from '../core/logger';
import { db, type DrizzleDatabase } from './connection';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgTransaction generics differ per driver/schema; any transaction must be accepted
export type DrizzleTxOrDb = DrizzleDatabase | PgTransaction<any, any, any>;

export const transactionStorage = new AsyncLocalStorage<DrizzleTxOrDb>();

/** Work waiting for a transaction to commit, per transaction object (`afterCommit`). */
const pendingAfterCommit = new WeakMap<object, (() => Promise<unknown>)[]>();

/**
 * Runs `fn` once the current transaction has committed (D63): at once outside a transaction, after
 * the outermost commit inside one, never after a rollback. Cache invalidation goes through it, so a
 * concurrent read cannot cache the old row again between the drop and the commit (R88). Work that
 * fails after the commit is logged, never thrown: the change it follows is already durable.
 */
export const afterCommit = async (fn: () => Promise<unknown>): Promise<void> => {
  const tx = transactionStorage.getStore();
  if (tx === undefined) {
    await runCommitted([fn]);
    return;
  }
  const queue = pendingAfterCommit.get(tx) ?? [];
  queue.push(fn);
  pendingAfterCommit.set(tx, queue);
};

const runCommitted = async (queue: readonly (() => Promise<unknown>)[]): Promise<void> => {
  for (const fn of queue) {
    try {
      await fn();
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Work after a committed transaction failed',
      );
    }
  }
};

/** Runs `fn` with `tx` active; a throw drops the work it queued with `afterCommit`. */
const runScoped = async <T>(tx: object, fn: () => Promise<T>): Promise<T> => {
  try {
    return await transactionStorage.run(tx as DrizzleTxOrDb, fn);
  } catch (error) {
    pendingAfterCommit.delete(tx);
    throw error;
  }
};

/** Runs and forgets the work queued on `tx` (only after its commit). */
const flushAfterCommit = async (tx: object): Promise<void> => {
  const queue = pendingAfterCommit.get(tx) ?? [];
  pendingAfterCommit.delete(tx);
  await runCommitted(queue);
};

/**
 * Tests of services: runs `fn` inside a stand-in transaction `tx` (repositories are fakes) and,
 * when `fn` succeeds, the work it queued with `afterCommit` — as a commit would.
 */
export const runInFakeTransaction = async <T>(tx: object, fn: () => Promise<T>): Promise<T> => {
  const result = await runScoped(tx, fn);
  await flushAfterCommit(tx);
  return result;
};

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
   * Runs `fn` in a transaction on the root connection (commit on success, rollback on throw), then
   * the work `fn` queued with `afterCommit`. Inside an active transaction `fn` joins it instead of
   * opening a nested one; its queued work then waits for that outer commit.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (transactionStorage.getStore()) {
      return fn();
    }
    let opened: object | undefined;
    const result = await this.root.transaction(async (tx) => {
      opened = tx;
      return runScoped(tx, fn);
    });
    if (opened !== undefined) await flushAfterCommit(opened);
    return result;
  }
}

export const defaultTxHost = new TransactionHost();
