import { z } from 'zod';
import { envSource } from './env-source';
import { parseEnv, type EnvSource } from './parse-env';

/** Languages the API can answer in (`Accept-Language`); messages are written for each. */
export const SUPPORTED_LOCALES = ['id', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

const appSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_NAME: z.string().default('bun-hono-drizzle-blueprint'),
  /** Unversioned root of the API (health, docs); versioned routers live in code under it (`/v1`). */
  API_BASE_PATH: z
    .string()
    .regex(/^(\/[A-Za-z0-9._-]+)+$/, 'must look like "/api" (leading slash, no trailing slash)')
    .default('/api'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DEFAULT_LOCALE: z.enum(SUPPORTED_LOCALES).default('id'),
  /** OpenAPI JSON + reference UI under `<API_BASE_PATH>/docs`. Unset = on, except in production. */
  API_DOCS_ENABLED: z.enum(['true', 'false']).optional(),
});

export type AppConfig = Omit<z.infer<typeof appSchema>, 'API_DOCS_ENABLED'> & {
  API_DOCS_ENABLED: boolean;
};

export const buildAppConfig = (source: EnvSource): AppConfig => {
  const config = parseEnv('app', appSchema, source);
  return {
    ...config,
    API_DOCS_ENABLED:
      config.API_DOCS_ENABLED === undefined
        ? config.NODE_ENV !== 'production'
        : config.API_DOCS_ENABLED === 'true',
  };
};

export const appConfig = buildAppConfig(envSource);
