import { transactionStorage } from './transaction-host';
import { db } from './connection';

export const runInTransaction = async <T>(fn: () => Promise<T>): Promise<T> => {
  const currentStore = transactionStorage.getStore();
  // Support nested transactions: if already inside a transaction or mock context, reuse it
  if (currentStore) {
    return fn();
  }

  return db.transaction(async (tx) => {
    return transactionStorage.run(tx, fn);
  });
};

/**
 * Method decorator @Transactional() for Service layer methods.
 * Automatically wraps execution in an ACID transaction with automatic commit / rollback.
 */
export function Transactional(): MethodDecorator {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      return runInTransaction(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
