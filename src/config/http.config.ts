import { z } from 'zod';
import { appConfig, type AppConfig } from './app.config';
import { envSource } from './env-source';
import { parseEnv, type EnvSource } from './parse-env';

/** `scheme://host[:port]` exactly — what browsers send in the `Origin` header. */
const isOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

const corsOriginsSchema = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .refine((origins) => origins.every((origin) => origin === '*' || isOrigin(origin)), {
    message: 'must be a comma-separated list of origins like https://app.example.com (no path)',
  });

const httpSchema = z.object({
  /** Empty = CORS disabled (no CORS headers at all). `*` reflects any origin — never in production. */
  CORS_ORIGINS: corsOriginsSchema,
  /** Reverse proxies in front of the app; the client IP is the n-th `X-Forwarded-For` entry from the right. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  HTTP_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

export type HttpConfig = z.infer<typeof httpSchema>;

const productionSchema = httpSchema.refine((config) => !config.CORS_ORIGINS.includes('*'), {
  path: ['CORS_ORIGINS'],
  message: '"*" is not allowed in production; list the allowed origins',
});

export const buildHttpConfig = (source: EnvSource, app: Pick<AppConfig, 'NODE_ENV'>): HttpConfig =>
  parseEnv('http', app.NODE_ENV === 'production' ? productionSchema : httpSchema, source);

export const httpConfig = buildHttpConfig(envSource, appConfig);
