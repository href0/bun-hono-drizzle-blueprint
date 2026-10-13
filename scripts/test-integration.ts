/**
 * Integration tests against a real PostgreSQL and Redis (plan step 6.1).
 *
 *   bun run test:int              # every test/integration/*.int.ts
 *   bun run test:int partner      # only files whose name contains "partner"
 *   bun run test:int --keep-db    # keep the database afterwards (debugging)
 *
 * Services come from TEST_DATABASE_URL (an existing database on the test server, e.g.
 * `postgresql://postgres:postgres@localhost:5432/postgres` — the runner only creates and drops
 * databases from it) and TEST_REDIS_HOST / TEST_REDIS_PORT / TEST_REDIS_PASSWORD / TEST_REDIS_DB.
 * Unset, they fall back to DATABASE_URL / REDIS_* — only on a developer machine (NODE_ENV
 * development or test) and only when those point at this machine, so neither a remote server nor
 * a server whose own PostgreSQL runs on localhost (a VPS) is ever used by accident.
 *
 * Every run is disposable: CREATE DATABASE <name>_it_<run> → `bun test` with the preload
 * test/integration/setup.ts (real migrations from drizzle/, test-only fixture tables) → DROP
 * DATABASE. Redis keys live under `<APP_NAME>:int-test:<run>` and are deleted one by one (SCAN +
 * DEL, never FLUSH*). The development database and the developer's keys are never touched.
 */
import { readdirSync } from 'node:fs';
import Redis from 'ioredis';
import postgres from 'postgres';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const INTEGRATION_DIR = 'test/integration';

const fail = (message: string): never => {
  console.error(`[test:int] ${message}`);
  process.exit(1);
};

const env = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === '' ? undefined : value;
};

/** A test service from TEST_* or, for this machine only, from the development settings. */
const pick = (testName: string, devName: string, devIsLocal: boolean): string | undefined =>
  env(testName) ?? (devIsLocal ? env(devName) : undefined);

interface Targets {
  /** Where the disposable database is created from (never written to). */
  adminUrl: URL;
  /** `<databaseBase>_it_<run>`: the prefix of every disposable database of this project. */
  databaseBase: string;
  databaseUrl: URL;
  databaseName: string;
  redis: { host: string; port: number; password: string; db: number; keyPrefix: string };
}

const resolveTargets = (runId: string): Targets => {
  const nodeEnv = env('NODE_ENV');
  if (nodeEnv === 'production') fail('refusing to run with NODE_ENV=production');

  const adminSource = env('TEST_DATABASE_URL') ?? env('DATABASE_URL');
  const fromDevelopment = env('TEST_DATABASE_URL') === undefined;
  if (adminSource === undefined) fail('set TEST_DATABASE_URL (see scripts/test-integration.ts)');
  // The development settings are a fallback only on a developer machine: a server whose
  // PostgreSQL also runs on localhost (a VPS) but whose NODE_ENV is missing must not qualify.
  const developerMachine = nodeEnv === 'development' || nodeEnv === 'test';
  if (fromDevelopment && !developerMachine) {
    fail(
      `NODE_ENV is ${nodeEnv ?? 'not set'}: the DATABASE_URL / REDIS_* fallback needs NODE_ENV=development or test — set TEST_DATABASE_URL and TEST_REDIS_HOST instead`,
    );
  }
  const adminUrl = new URL(adminSource ?? '');
  if (fromDevelopment && !LOCAL_HOSTS.has(adminUrl.hostname)) {
    fail(
      `DATABASE_URL points at ${adminUrl.hostname}, not this machine: set TEST_DATABASE_URL to a test server`,
    );
  }

  const devRedisIsLocal = developerMachine && LOCAL_HOSTS.has(env('REDIS_HOST') ?? '');
  const redisHost = pick('TEST_REDIS_HOST', 'REDIS_HOST', devRedisIsLocal);
  if (redisHost === undefined) {
    fail('set TEST_REDIS_HOST (REDIS_HOST is not on this machine or not set)');
  }

  const baseName = decodeURIComponent(adminUrl.pathname.slice(1)) || 'app';
  // PostgreSQL identifiers: at most 63 bytes; keep the name plain so it never needs quoting tricks.
  const databaseBase = baseName
    .replace(/[^a-z0-9_]/gi, '_')
    .slice(0, 40)
    .toLowerCase();
  const databaseName = `${databaseBase}_it_${runId}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;

  return {
    adminUrl,
    databaseBase,
    databaseUrl,
    databaseName,
    redis: {
      host: redisHost ?? '',
      port: Number(pick('TEST_REDIS_PORT', 'REDIS_PORT', devRedisIsLocal) ?? 6379),
      password: pick('TEST_REDIS_PASSWORD', 'REDIS_PASSWORD', devRedisIsLocal) ?? '',
      db: Number(pick('TEST_REDIS_DB', 'REDIS_DB', devRedisIsLocal) ?? 0),
      keyPrefix: `${env('APP_NAME') ?? 'app'}:int-test:${runId}`,
    },
  };
};

const integrationFiles = (filters: string[]): string[] =>
  readdirSync(INTEGRATION_DIR)
    .filter((file) => file.endsWith('.int.ts'))
    .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
    .sort()
    .map((file) => `./${INTEGRATION_DIR}/${file}`);

/** Deletes the run's keys one by one (SCAN + DEL); FLUSH* would hit everyone sharing the Redis. */
const deleteRedisKeys = async (redis: Targets['redis']): Promise<number> => {
  const client = new Redis({
    host: redis.host,
    port: redis.port,
    password: redis.password || undefined,
    db: redis.db,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await client.connect();
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${redis.keyPrefix}:*`, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) deleted += await client.del(...keys);
    } while (cursor !== '0');
    return deleted;
  } finally {
    client.disconnect();
  }
};

/** Runs interrupted before their DROP leave a database behind; older than this, it is dropped. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Every database this runner creates carries this comment; only such databases are ever dropped
 * as stale — never one that merely looks alike (`LIKE` treats `_` as a wildcard, and a project's
 * own database could be named `<name>_it_<something>`).
 */
const DISPOSABLE_MARKER = 'test:int disposable database (scripts/test-integration.ts)';
const RUN_ID = /^[a-z0-9]{8}$/;

/** Drops disposable databases of earlier runs that never finished (killed, crashed). */
const dropStaleDatabases = async (admin: postgres.Sql, baseName: string): Promise<void> => {
  const rows = await admin<{ datname: string }[]>`
    select datname from pg_database
    where shobj_description(oid, 'pg_database') = ${DISPOSABLE_MARKER}`;
  for (const { datname } of rows) {
    const runId = datname.slice(`${baseName}_it_`.length);
    if (!datname.startsWith(`${baseName}_it_`) || !RUN_ID.test(runId)) continue;
    const started = parseInt(runId, 36);
    if (Date.now() - started < STALE_AFTER_MS) continue;
    await admin.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    console.log(`[test:int] stale database ${datname} dropped`);
  }
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const keepDatabase = args.includes('--keep-db');
  const files = integrationFiles(args.filter((arg) => !arg.startsWith('--')));
  if (files.length === 0) fail(`no ${INTEGRATION_DIR}/*.int.ts file matches ${args.join(' ')}`);

  const runId = Date.now().toString(36);
  const targets = resolveTargets(runId);
  const admin = postgres(targets.adminUrl.toString(), { max: 1, onnotice: () => undefined });

  let exitCode = 1;
  try {
    await dropStaleDatabases(admin, targets.databaseBase);
    await admin.unsafe(`CREATE DATABASE "${targets.databaseName}"`);
    await admin.unsafe(
      `COMMENT ON DATABASE "${targets.databaseName}" IS '${DISPOSABLE_MARKER.replaceAll("'", "''")}'`,
    );
    console.log(`[test:int] database ${targets.databaseName} created`);

    const run = Bun.spawn(
      ['bun', 'test', '--preload', `./${INTEGRATION_DIR}/setup.ts`, '--timeout', '20000', ...files],
      {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: {
          ...process.env,
          INT_DATABASE_URL: targets.databaseUrl.toString(),
          INT_REDIS_HOST: targets.redis.host,
          INT_REDIS_PORT: String(targets.redis.port),
          INT_REDIS_PASSWORD: targets.redis.password,
          INT_REDIS_DB: String(targets.redis.db),
          INT_REDIS_KEY_PREFIX: targets.redis.keyPrefix,
        },
      },
    );
    exitCode = await run.exited;
  } finally {
    if (keepDatabase) {
      console.log(`[test:int] --keep-db: database ${targets.databaseName} kept`);
    } else {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${targets.databaseName}" WITH (FORCE)`);
      console.log(`[test:int] database ${targets.databaseName} dropped`);
    }
    await admin.end();
    const deleted = await deleteRedisKeys(targets.redis).catch((error: unknown) => {
      console.error(`[test:int] Redis cleanup failed: ${String(error)}`);
      return 0;
    });
    console.log(
      `[test:int] ${String(deleted)} Redis key(s) under ${targets.redis.keyPrefix}: deleted`,
    );
  }
  process.exit(exitCode);
};

await main();
