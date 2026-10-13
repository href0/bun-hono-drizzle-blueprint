/**
 * Helpers of the integration suite (test/integration/*.int.ts, `bun run test:int`).
 */
import { runWithRequestContext, type Actor } from '../../src/core/context/request-context';

/** A user actor for audit columns and record_changes, like an authenticated request has. */
export const INTEGRATION_ACTOR: Actor = 'user:0192f1d0-0000-7000-8000-00000000beef';
export const INTEGRATION_REQUEST_ID = 'int-test-request';

/** Runs `fn` as a request of INTEGRATION_ACTOR, like a controller would. */
export const asActor = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithRequestContext(
    {
      requestId: INTEGRATION_REQUEST_ID,
      locale: 'en',
      clientIp: '127.0.0.1',
      actor: INTEGRATION_ACTOR,
    },
    fn,
  );

/**
 * The error a promise rejects with (or `undefined` when it resolves). Use it instead of
 * `expect(promise).rejects` / `.resolves`: in Bun 1.3.0 those wait on the promise in a way that
 * can stall real socket I/O — a transaction then stays `idle in transaction` and the test times
 * out (found in plan step 6.1). Await first, assert after.
 */
export const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** A value unique to this run (rows stay in the run's database until it is dropped). */
export const unique = (label: string): string => `${label}-${Bun.randomUUIDv7().slice(-12)}`;
