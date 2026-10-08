import { defaultTxHost } from './transaction-host';

/** Runs `fn` in a transaction on the default connection; joins an active one (`TransactionHost.run`). */
export const runInTransaction = async <T>(fn: () => Promise<T>): Promise<T> =>
  defaultTxHost.run(fn);

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
