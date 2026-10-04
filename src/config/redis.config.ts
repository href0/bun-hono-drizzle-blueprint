import { z } from 'zod';
import { envSource } from './env-source';
import { isTestEnvironment, parseEnv, type EnvSource } from './parse-env';

const redisSchema = z.object({
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_KEY_PREFIX: z.string().default(''),
});

/** Tests never reach a real Redis; required connection settings get harmless defaults. */
const TEST_DEFAULTS: EnvSource = {
  REDIS_HOST: 'localhost',
};

export type RedisConfig = z.infer<typeof redisSchema>;

export const buildRedisConfig = (source: EnvSource): RedisConfig =>
  parseEnv(
    'redis',
    redisSchema,
    isTestEnvironment(source) ? { ...TEST_DEFAULTS, ...source } : source,
  );

export const redisConfig = buildRedisConfig(envSource);
