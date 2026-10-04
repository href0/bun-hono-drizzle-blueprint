import { z } from 'zod';
import { envSource } from './env-source';
import { isTestEnvironment, parseEnv, type EnvSource } from './parse-env';

const databaseSchema = z.object({
  DATABASE_URL: z.string().url(),
  DB_SCHEMA: z.string().min(1).default('public'),
  DB_MAX_CONNECTIONS: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
});

/** Tests never reach a real database; required connection settings get harmless defaults. */
const TEST_DEFAULTS: EnvSource = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app_test',
};

export type DatabaseConfig = z.infer<typeof databaseSchema>;

export const buildDatabaseConfig = (source: EnvSource): DatabaseConfig =>
  parseEnv(
    'database',
    databaseSchema,
    isTestEnvironment(source) ? { ...TEST_DEFAULTS, ...source } : source,
  );

export const databaseConfig = buildDatabaseConfig(envSource);
