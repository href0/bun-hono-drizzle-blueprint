/**
 * The PostgreSQL and Redis that disposable test runs use — `bun run test:int` and
 * `bun run acceptance` — and the cleanup of their Redis keys.
 *
 * Services come from TEST_DATABASE_URL (an existing database on the test server, e.g.
 * `postgresql://postgres:postgres@localhost:5432/postgres` — runners only create and drop
 * databases from it) and TEST_REDIS_HOST / TEST_REDIS_PORT / TEST_REDIS_PASSWORD / TEST_REDIS_DB.
 * Unset, they fall back to DATABASE_URL / REDIS_* — only on a developer machine (NODE_ENV
 * development or test) and only when those point at this machine, so neither a remote server nor
 * a server whose own PostgreSQL runs on localhost (a VPS) is ever used by accident.
 */
import Redis from 'ioredis';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const env = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === '' ? undefined : value;
};

export interface RedisTarget {
  host: string;
  port: number;
  password: string;
  db: number;
}

export interface ServiceTargets {
  /** Where disposable databases are created from (never written to). */
  adminUrl: URL;
  databaseSource: 'TEST_DATABASE_URL' | 'DATABASE_URL';
  redis: RedisTarget;
  redisSource: 'TEST_REDIS_*' | 'REDIS_*';
}

/**
 * Redis of the run: every setting from TEST_REDIS_* when TEST_REDIS_HOST is set, otherwise every
 * setting from REDIS_* (developer machine, localhost only) — never a mix, so a local password or
 * port never travels to another server.
 */
const resolveRedis = (
  developerMachine: boolean,
  fail: (message: string) => never,
): Pick<ServiceTargets, 'redis' | 'redisSource'> => {
  const prefix = env('TEST_REDIS_HOST') === undefined ? 'REDIS' : 'TEST_REDIS';
  if (prefix === 'REDIS' && !(developerMachine && LOCAL_HOSTS.has(env('REDIS_HOST') ?? ''))) {
    fail(
      'set TEST_REDIS_HOST (REDIS_HOST is not on this machine, not set, or NODE_ENV is not development/test)',
    );
  }
  return {
    redisSource: prefix === 'REDIS' ? 'REDIS_*' : 'TEST_REDIS_*',
    redis: {
      host: env(`${prefix}_HOST`) ?? '',
      port: Number(env(`${prefix}_PORT`) ?? 6379),
      password: env(`${prefix}_PASSWORD`) ?? '',
      db: Number(env(`${prefix}_DB`) ?? 0),
    },
  };
};

/** The services of a disposable run, or `fail` with what to set instead. */
export const resolveServices = (fail: (message: string) => never): ServiceTargets => {
  const nodeEnv = env('NODE_ENV');
  if (nodeEnv === 'production') fail('refusing to run with NODE_ENV=production');

  const adminSource = env('TEST_DATABASE_URL') ?? env('DATABASE_URL');
  const fromDevelopment = env('TEST_DATABASE_URL') === undefined;
  if (adminSource === undefined) fail('set TEST_DATABASE_URL (see scripts/lib/test-services.ts)');
  // The development settings are a fallback only on a developer machine: a server whose
  // PostgreSQL also runs on localhost (a VPS) but whose NODE_ENV is missing must not qualify.
  const developerMachine = nodeEnv === 'development' || nodeEnv === 'test';
  if (fromDevelopment && !developerMachine) {
    fail(
      `NODE_ENV is ${nodeEnv ?? 'not set'}: the DATABASE_URL / REDIS_* fallback needs NODE_ENV=development or test — set TEST_DATABASE_URL and TEST_REDIS_HOST instead`,
    );
  }
  const adminUrl = new URL(adminSource);
  if (fromDevelopment && !LOCAL_HOSTS.has(adminUrl.hostname)) {
    fail(
      `DATABASE_URL points at ${adminUrl.hostname}, not this machine: set TEST_DATABASE_URL to a test server`,
    );
  }
  return {
    adminUrl,
    databaseSource: fromDevelopment ? 'DATABASE_URL' : 'TEST_DATABASE_URL',
    ...resolveRedis(developerMachine, fail),
  };
};

/** A PostgreSQL identifier from the admin database name: plain, so it never needs quoting tricks. */
export const databaseBaseOf = (adminUrl: URL): string =>
  (decodeURIComponent(adminUrl.pathname.slice(1)) || 'app')
    .replace(/[^a-z0-9_]/gi, '_')
    // At most 63 bytes in PostgreSQL; the runners append their own suffix.
    .slice(0, 40)
    .toLowerCase();

/** Deletes the run's keys one by one (SCAN + DEL); FLUSH* would hit everyone sharing the Redis. */
export const deleteRedisKeys = async (redis: RedisTarget, keyPrefix: string): Promise<number> => {
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
      const [next, keys] = await client.scan(cursor, 'MATCH', `${keyPrefix}:*`, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) deleted += await client.del(...keys);
    } while (cursor !== '0');
    return deleted;
  } finally {
    client.disconnect();
  }
};
