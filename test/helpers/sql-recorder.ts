/**
 * SQL recorder for data-layer unit tests.
 *
 * A real Drizzle instance (the production `postgres-js` driver and schema) on top of a fake
 * postgres.js client: every statement is recorded with its parameters, and rows queued with
 * `respondWith` are returned in order. Repository tests therefore assert the SQL that is actually
 * sent — conditions, ordering, limits, BEGIN/COMMIT/ROLLBACK — instead of the shape of a call chain.
 *
 * Proves what is sent, not how PostgreSQL behaves (constraints, partial indexes, locks): that is
 * the integration suite.
 */
import { getTableColumns, type Table } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import * as schema from '../../src/database/schema';
import type { DrizzleDatabase } from '../../src/database/connection';
import { TransactionHost } from '../../src/database/transaction-host';

export interface RecordedStatement {
  sql: string;
  params: unknown[];
}

/** A result set as the driver returns it: one array of column values per row. */
export type DriverRows = unknown[][];

export interface SqlRecorder {
  /** Drizzle instance backed by the recorder. */
  db: DrizzleDatabase;
  /** `TransactionHost` whose root connection is the recorder — inject it into repositories. */
  txHost: TransactionHost;
  /** Every statement in order; transactions appear as `BEGIN` / `COMMIT` / `ROLLBACK`, savepoints as `SAVEPOINT` / `RELEASE` / `ROLLBACK TO SAVEPOINT`. */
  statements: RecordedStatement[];
  /** Queues one result set per upcoming query, in order. A query with nothing queued gets no rows. */
  respondWith: (...results: DriverRows[]) => void;
  /** Clears statements and queued results. */
  reset: () => void;
}

const control = (statements: RecordedStatement[], sql: string): void => {
  statements.push({ sql, params: [] });
};

export const createSqlRecorder = (): SqlRecorder => {
  const statements: RecordedStatement[] = [];
  const queue: DriverRows[] = [];

  const runQuery = (
    sql: string,
    params: unknown[],
  ): Promise<DriverRows> & { values: () => Promise<DriverRows> } => {
    statements.push({ sql, params });
    const rows = queue.shift() ?? [];
    // postgres.js: awaiting the query yields rows; `.values()` yields them in array form.
    return Object.assign(Promise.resolve(rows), { values: () => Promise.resolve(rows) });
  };

  const scope = async <T>(
    open: string,
    commit: string,
    rollback: string,
    fn: (client: unknown) => Promise<T>,
    client: unknown,
  ): Promise<T> => {
    control(statements, open);
    try {
      const result = await fn(client);
      control(statements, commit);
      return result;
    } catch (error) {
      control(statements, rollback);
      throw error;
    }
  };

  const transactionClient = {
    unsafe: runQuery,
    savepoint: async <T>(fn: (client: unknown) => Promise<T>): Promise<T> =>
      scope('SAVEPOINT', 'RELEASE', 'ROLLBACK TO SAVEPOINT', fn, transactionClient),
  };

  const client = {
    // drizzle() swaps the type parsers here so dates reach the column mappers as text, like production.
    options: { parsers: {}, serializers: {} },
    unsafe: runQuery,
    begin: async <T>(fn: (client: unknown) => Promise<T>): Promise<T> =>
      scope('BEGIN', 'COMMIT', 'ROLLBACK', fn, transactionClient),
  };

  // The fake implements only what Drizzle's postgres-js session calls (unsafe, begin, savepoint).
  const db = drizzle(client as unknown as Sql, { schema });

  return {
    db,
    txHost: new TransactionHost(db),
    statements,
    respondWith: (...results) => {
      queue.push(...results);
    },
    reset: () => {
      statements.length = 0;
      queue.length = 0;
    },
  };
};

/**
 * Converts an entity into a driver row for `select()` / `returning()` of the whole table: values
 * in column declaration order, mapped to their driver form (e.g. `Temporal.Instant` → ISO text).
 */
export const rowOf = <TTable extends Table>(
  table: TTable,
  entity: TTable['$inferSelect'],
): unknown[] =>
  Object.entries(getTableColumns(table)).map(([key, column]) => {
    const value = (entity as Record<string, unknown>)[key];
    return value === null || value === undefined ? null : column.mapToDriverValue(value);
  });
