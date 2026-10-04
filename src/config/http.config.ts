import { z } from 'zod';
import { envSource } from './env-source';
import { parseEnv, type EnvSource } from './parse-env';

const httpSchema = z.object({
  // '*' for development; comma-separated origins otherwise (hardened in plan step 1.7).
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

export type HttpConfig = z.infer<typeof httpSchema>;

export const buildHttpConfig = (source: EnvSource): HttpConfig =>
  parseEnv('http', httpSchema, source);

export const httpConfig = buildHttpConfig(envSource);
