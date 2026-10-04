import { z } from 'zod';
import { appConfig, type AppConfig } from './app.config';
import { envSource } from './env-source';
import { isTestEnvironment, parseEnv, type EnvSource } from './parse-env';

/** `segment(:segment)*` — ioredis appends the final `:` itself. */
const KEY_PREFIX_PATTERN = /^[\w.-]+(?::[\w.-]+)*$/;

const redisSchema = z.object({
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  /** Empty = `<APP_NAME>:<NODE_ENV>`, so projects and environments sharing a Redis never collide. */
  REDIS_KEY_PREFIX: z
    .string()
    .default('')
    .refine((value) => value === '' || KEY_PREFIX_PATTERN.test(value), {
      message: 'must look like "segment" or "segment:segment" (letters, digits, _ . -)',
    }),
  /** A command slower than this fails (and the cache fails open) instead of stalling the request. */
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),
});

/** Tests never reach a real Redis; required connection settings get harmless defaults. */
const TEST_DEFAULTS: EnvSource = {
  REDIS_HOST: 'localhost',
};

export type RedisConfig = z.infer<typeof redisSchema>;

export const buildRedisConfig = (
  source: EnvSource,
  app: Pick<AppConfig, 'APP_NAME' | 'NODE_ENV'>,
): RedisConfig => {
  const config = parseEnv(
    'redis',
    redisSchema,
    isTestEnvironment(source) ? { ...TEST_DEFAULTS, ...source } : source,
  );
  return {
    ...config,
    REDIS_KEY_PREFIX: config.REDIS_KEY_PREFIX || `${app.APP_NAME}:${app.NODE_ENV}`,
  };
};

export const redisConfig = buildRedisConfig(envSource, appConfig);
