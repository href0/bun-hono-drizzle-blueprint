/**
 * Integration tests against a real PostgreSQL and Redis (plan step 6.1).
 *
 *   bun run test:int              # every test/integration/*.int.ts
 *   bun run test:int auth         # only files whose name contains "auth"
 *   bun run test:int --keep-db    # keep the database afterwards (debugging)
 *   bun run test:int --dry-run    # print the targets a run would use, touch nothing
 *
 * Services: TEST_DATABASE_URL + TEST_REDIS_* (or the local development settings on a developer
 * machine only) — scripts/lib/test-services.ts.
 *
 * Every run is disposable: CREATE DATABASE <name>_it_<run> → `bun test` with the preload
 * test/integration/setup.ts (real migrations from drizzle/, test-only fixture tables) → DROP
 * DATABASE. Redis keys live under `<APP_NAME>:int-test:<run>` and are deleted one by one (SCAN +
 * DEL, never FLUSH*). The development database and the developer's keys are never touched.
 */
import { readdirSync } from 'node:fs';
import postgres from 'postgres';
import { readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';
import {
  databaseBaseOf,
  deleteRedisKeys,
  env,
  resolveServices,
  type RedisTarget,
  type ServiceTargets,
} from './lib/test-services';

const INTEGRATION_DIR = 'test/integration';

const fail = (message: string): never => {
  console.error(`[test:int] ${message}`);
  process.exit(1);
};

interface Targets extends ServiceTargets {
  /** `<databaseBase>_it_<run>`: the prefix of every disposable database of this project. */
  databaseBase: string;
  databaseUrl: URL;
  databaseName: string;
  redis: RedisTarget & { keyPrefix: string };
}

const resolveTargets = (runId: string): Targets => {
  const services = resolveServices(fail);
  const databaseBase = databaseBaseOf(services.adminUrl);
  const databaseName = `${databaseBase}_it_${runId}`;
  const databaseUrl = new URL(services.adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  return {
    ...services,
    databaseBase,
    databaseUrl,
    databaseName,
    redis: { ...services.redis, keyPrefix: `${env('APP_NAME') ?? 'app'}:int-test:${runId}` },
  };
};

const integrationFiles = (filters: string[]): string[] =>
  readdirSync(INTEGRATION_DIR)
    .filter((file) => file.endsWith('.int.ts'))
    .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
    .sort()
    .map((file) => `./${INTEGRATION_DIR}/${file}`);

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
  const cli = readCli(process.argv.slice(2), usageOf('test-integration.ts'), {
    flags: ['--keep-db', '--dry-run'],
    positionals: Number.POSITIVE_INFINITY,
  });
  const keepDatabase = cli.flags.has('--keep-db');
  const dryRun = cli.flags.has('--dry-run');
  const files = integrationFiles([...cli.positionals]);
  if (files.length === 0) {
    fail(`no ${INTEGRATION_DIR}/*.int.ts file matches ${cli.positionals.join(' ')}`);
  }

  const runId = Date.now().toString(36);
  const targets = resolveTargets(runId);
  if (dryRun) {
    // What a run would use, without touching anything (passwords never printed).
    console.log(
      [
        `[test:int] database ${targets.databaseName} on ${targets.adminUrl.host} (from ${targets.databaseSource})`,
        `[test:int] redis ${targets.redis.host}:${String(targets.redis.port)} db ${String(targets.redis.db)}, password ${targets.redis.password === '' ? 'empty' : 'set'} (from ${targets.redisSource}), prefix ${targets.redis.keyPrefix}`,
        `[test:int] files ${files.join(' ')}`,
      ].join('\n'),
    );
    return;
  }
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
    const deleted = await deleteRedisKeys(targets.redis, targets.redis.keyPrefix).catch(
      (error: unknown) => {
        console.error(`[test:int] Redis cleanup failed: ${String(error)}`);
        return 0;
      },
    );
    console.log(
      `[test:int] ${String(deleted)} Redis key(s) under ${targets.redis.keyPrefix}: deleted`,
    );
  }
  process.exit(exitCode);
};

await main();
