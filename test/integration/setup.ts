/**
 * Preload of the integration suite (`bun run test:int` → scripts/test-integration.ts), after the
 * hermetic preload: points the app at the run's disposable database and Redis key prefix, applies
 * the real migrations (drizzle/) and creates the test-only fixture tables. Never run directly —
 * the runner creates the database and passes it as INT_*.
 */
import { afterAll } from 'bun:test';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';

const DISPOSABLE_DATABASE = /_it_[a-z0-9]+$/;

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is missing: integration tests run through "bun run test:int", which creates a disposable database`,
    );
  }
  return value;
};

const databaseUrl = required('INT_DATABASE_URL');
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!DISPOSABLE_DATABASE.test(databaseName)) {
  // Defence in depth: migrations and test data only ever go to a database the runner created.
  throw new Error(
    `refusing to use database "${databaseName}": not a disposable *_it_<run> database`,
  );
}

Object.assign(process.env, {
  DATABASE_URL: databaseUrl,
  REDIS_HOST: required('INT_REDIS_HOST'),
  REDIS_PORT: required('INT_REDIS_PORT'),
  REDIS_PASSWORD: process.env.INT_REDIS_PASSWORD ?? '',
  REDIS_DB: process.env.INT_REDIS_DB ?? '0',
  REDIS_KEY_PREFIX: required('INT_REDIS_KEY_PREFIX'),
});

// Imported only now: the configs read the environment when they load.
const { migrate } = await import('drizzle-orm/postgres-js/migrator');
const { db, sqlClient } = await import('../../src/database/connection');
const schema = await import('../../src/database/schema');
const fixtures = await import('../helpers/repository-fixtures');

await migrate(db, { migrationsFolder: 'drizzle' });

// The generic data-layer fixtures (test_orders, test_order_lines, test_events) are not in the
// schema barrel, so no migration creates them: their DDL is the difference schema → schema + them.
const platform = generateDrizzleJson({ ...schema });
const withFixtures = generateDrizzleJson({
  ...schema,
  testOrders: fixtures.testOrders,
  testOrderLines: fixtures.testOrderLines,
  testEvents: fixtures.testEvents,
});
for (const statement of await generateMigration(platform, withFixtures)) {
  await sqlClient.unsafe(statement);
}

// The app connects Redis at startup (src/index.ts); the suite does the same once, and closes both
// connections after the last file (a hook in a preload is global) so `bun test` can exit.
const { closeRedisClient, redisClient } = await import('../../src/core/cache/redis.client');
await redisClient.connect();
afterAll(async () => {
  await Promise.all([sqlClient.end(), closeRedisClient(redisClient)]);
});
