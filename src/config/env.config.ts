import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const isTestEnv = process.env.NODE_ENV === 'test';
const envFileExists = existsSync(resolve(process.cwd(), '.env'));

// Fail-fast if running server locally without .env or system envs
if (!isTestEnv && !envFileExists && !process.env.DATABASE_URL) {
  throw new Error(
    'CRITICAL STARTUP ERROR: Configuration file `.env` is missing.\n' +
      'The application cannot start without database and service configurations.\n' +
      'Please copy `.env.example` to `.env` and configure your credentials:\n' +
      '  cp .env.example .env\n',
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default('bun-hono-starter'),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: isTestEnv
    ? z.string().default('postgresql://postgres:postgres@localhost:5432/app_test')
    : z.string().min(1, 'DATABASE_URL is required'),
  DB_SCHEMA: z.string().default('public'),
  DB_MAX_CONNECTIONS: z.coerce.number().default(20),
  DB_IDLE_TIMEOUT_SECONDS: z.coerce.number().default(30),

  // Redis
  REDIS_HOST: isTestEnv
    ? z.string().default('localhost')
    : z.string().min(1, 'REDIS_HOST is required'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_KEY_PREFIX: z.string().optional().default(''),

  // External Integrations (Reference Example)
  EXTERNAL_VENDOR_BASE_URL: z.string().optional().default('https://api.example.com'),
  EXTERNAL_VENDOR_TIMEOUT_MS: z.coerce.number().default(10000),
  JSONPLACEHOLDER_BASE_URL: z.string().default('https://jsonplaceholder.typicode.com'),
  JSONPLACEHOLDER_TIMEOUT_MS: z.coerce.number().default(10000),

  // CORS
  CORS_ORIGIN: z.string().optional().default('*'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

export type EnvConfig = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errorDetails = JSON.stringify(parsed.error.format(), null, 2);
  // Throw immediately to prevent booting with invalid configuration
  throw new Error(`Environment validation failed on startup:\n${errorDetails}`);
}

export const env: EnvConfig = parsed.data;
