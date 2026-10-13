import Redis, { type Command, type RedisOptions } from 'ioredis';
import { redisConfig, type RedisConfig } from '../../config';
import { logger } from '../logger/logger';

/** Whole-keyspace commands: on a shared Redis they wipe or stall every other tenant. */
export const BLOCKED_COMMANDS: ReadonlySet<string> = new Set(['flushall', 'flushdb', 'keys']);

const MAX_RECONNECT_DELAY_MS = 30_000;

/** Never gives up: back off linearly to 30 s, then keep retrying every 30 s until Redis returns. */
export const reconnectDelay = (attempt: number): number =>
  Math.min(attempt * 500, MAX_RECONNECT_DELAY_MS);

export const buildRedisOptions = (config: RedisConfig): RedisOptions => ({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  db: config.REDIS_DB,
  keyPrefix: `${config.REDIS_KEY_PREFIX}:`,
  lazyConnect: true,
  // Fail fast while disconnected: callers fail open instead of queueing behind a dead socket.
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  commandTimeout: config.REDIS_COMMAND_TIMEOUT_MS,
  retryStrategy: reconnectDelay,
});

/**
 * Rejects {@link BLOCKED_COMMANDS}. Every command — direct methods, `call()`, pipelines and
 * `multi()` — goes through `sendCommand`, so this is the single choke point.
 */
export class SafeRedis extends Redis {
  override sendCommand(command: Command, stream?: Parameters<Redis['sendCommand']>[1]): unknown {
    if (BLOCKED_COMMANDS.has(command.name.toLowerCase())) {
      command.reject(
        new Error(`Redis command "${command.name.toUpperCase()}" is blocked; use SCAN or TTLs`),
      );
      return command.promise;
    }
    return super.sendCommand(command, stream);
  }
}

export const createRedisClient = (config: RedisConfig): SafeRedis => {
  const client = new SafeRedis(buildRedisOptions(config));

  client.on('error', (err: Error) => {
    logger.warn({ err: err.message }, 'Redis connection error (cache failing open, reconnecting)');
  });

  client.on('ready', () => {
    logger.info({ keyPrefix: config.REDIS_KEY_PREFIX }, 'Redis connection ready');
  });

  return client;
};

/**
 * Shutdown-safe close: `QUIT` (flushes pending replies) only when connected. Otherwise
 * `quit()` is rejected — the offline queue is off — so the socket and reconnect loop are dropped.
 * Right after a dropped connection `status` can still read `ready` while the socket is gone (found
 * in the integration suite, plan step 6.1): a rejected `QUIT` then also falls back to dropping it,
 * so shutdown never fails on Redis.
 */
export const closeRedisClient = async (
  client: Pick<Redis, 'status' | 'quit' | 'disconnect'>,
): Promise<void> => {
  if (client.status === 'ready') {
    try {
      await client.quit();
      return;
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Redis QUIT failed on close; dropping the connection',
      );
    }
  }
  client.disconnect();
};

export const redisClient = createRedisClient(redisConfig);
