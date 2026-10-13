import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import {
  BLOCKED_COMMANDS,
  buildRedisOptions,
  closeRedisClient,
  createRedisClient,
  reconnectDelay,
  redisClient,
  SafeRedis,
} from './redis.client';
import { redisConfig, type RedisConfig } from '../../config';
import { logger } from '../logger/logger';

/** Awaits a promise expected to reject and returns the error (Bun types `.rejects` as void). */
const rejectionOf = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (err: unknown) {
    if (err instanceof Error) return err;
  }
  throw new Error('expected the promise to reject with an Error');
};

const config: RedisConfig = {
  REDIS_HOST: 'redis.internal',
  REDIS_PORT: 6380,
  REDIS_PASSWORD: '',
  REDIS_DB: 2,
  REDIS_KEY_PREFIX: 'my-app:production',
  REDIS_COMMAND_TIMEOUT_MS: 750,
};

/** Never connects: lazy, no offline queue, no reconnect. */
const offlineClient = (): SafeRedis =>
  new SafeRedis({ lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null });

describe('reconnectDelay', () => {
  it('backs off linearly and caps at 30 s', () => {
    expect(reconnectDelay(1)).toBe(500);
    expect(reconnectDelay(10)).toBe(5_000);
    expect(reconnectDelay(60)).toBe(30_000);
  });

  it('never gives up (a number, not null, however many attempts)', () => {
    expect(reconnectDelay(1_000_000)).toBe(30_000);
  });
});

describe('buildRedisOptions', () => {
  it('maps config to fail-fast, prefixed client options', () => {
    expect(buildRedisOptions(config)).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      password: undefined,
      db: 2,
      keyPrefix: 'my-app:production:',
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 750,
      retryStrategy: reconnectDelay,
    });
  });

  it('passes a non-empty password through', () => {
    expect(buildRedisOptions({ ...config, REDIS_PASSWORD: 's3cret' }).password).toBe('s3cret');
  });
});

describe('SafeRedis', () => {
  it('blocks FLUSHALL, FLUSHDB and KEYS whatever API calls them', async () => {
    const client = offlineClient();

    expect((await rejectionOf(client.flushall())).message).toBe(
      'Redis command "FLUSHALL" is blocked; use SCAN or TTLs',
    );
    expect((await rejectionOf(client.flushdb())).message).toContain('"FLUSHDB" is blocked');
    expect((await rejectionOf(client.keys('*'))).message).toContain('"KEYS" is blocked');
    expect((await rejectionOf(client.call('FlushAll'))).message).toContain('"FLUSHALL" is blocked');
    expect([...BLOCKED_COMMANDS].sort()).toEqual(['flushall', 'flushdb', 'keys']);
    expect(client.status).toBe('wait'); // blocked before any connection attempt
  });

  it('blocks them inside pipelines too', async () => {
    const results = await offlineClient().pipeline().flushdb().exec();
    expect(results?.[0]?.[0]?.message).toContain('"FLUSHDB" is blocked');
  });

  it('passes other commands through to ioredis', async () => {
    const client = offlineClient();
    client.disconnect();

    expect((await rejectionOf(client.get('key'))).message).toContain('Connection is closed');
  });
});

describe('closeRedisClient', () => {
  it('sends QUIT when connected', async () => {
    const client = { status: 'ready', quit: mock(async () => 'OK'), disconnect: mock(() => {}) };
    await closeRedisClient(client as unknown as SafeRedis);
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('drops the socket when QUIT is rejected although the status still reads ready', async () => {
    const client = {
      status: 'ready',
      quit: mock(() => Promise.reject(new Error("Stream isn't writeable"))),
      disconnect: mock(() => {}),
    };
    await closeRedisClient(client as unknown as SafeRedis);
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('drops the socket without QUIT when Redis is not ready (quit() would reject)', async () => {
    const client = offlineClient();
    expect((await rejectionOf(client.quit())).message).toContain('enableOfflineQueue');

    const fresh = offlineClient();
    await closeRedisClient(fresh);
    expect(fresh.status).toBe('end');
  });
});

describe('createRedisClient', () => {
  const clients: SafeRedis[] = [];
  afterEach(() => {
    for (const client of clients.splice(0)) client.disconnect();
  });

  it('logs connection errors as warnings and readiness as info', () => {
    const warn = spyOn(logger, 'warn').mockImplementation(() => undefined);
    const info = spyOn(logger, 'info').mockImplementation(() => undefined);
    try {
      const client = createRedisClient(config);
      clients.push(client);

      client.emit('error', new Error('connect ECONNREFUSED'));
      client.emit('ready');

      expect(warn).toHaveBeenCalledWith(
        { err: 'connect ECONNREFUSED' },
        expect.stringContaining('failing open'),
      );
      expect(info).toHaveBeenCalledWith(
        { keyPrefix: 'my-app:production' },
        'Redis connection ready',
      );
    } finally {
      warn.mockRestore();
      info.mockRestore();
    }
  });

  it('builds the shared client from redisConfig with the automatic key prefix', () => {
    expect(redisClient).toBeInstanceOf(SafeRedis);
    expect(redisClient.options.keyPrefix).toBe(`${redisConfig.REDIS_KEY_PREFIX}:`);
    expect(redisClient.status).toBe('wait'); // lazy: importing never opens a connection
  });
});
