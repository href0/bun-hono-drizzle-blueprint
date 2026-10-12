import { z } from 'zod';
import { envSource } from './env-source';
import { parseEnv, type EnvSource } from './parse-env';

/** One config group per vendor (`src/config/<vendor>.config.ts`): `JSONPLACEHOLDER_*`. */
const jsonPlaceholderSchema = z.object({
  JSONPLACEHOLDER_BASE_URL: z.string().url().default('https://jsonplaceholder.typicode.com'),
  JSONPLACEHOLDER_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type JsonPlaceholderConfig = z.infer<typeof jsonPlaceholderSchema>;

export const buildJsonPlaceholderConfig = (source: EnvSource): JsonPlaceholderConfig =>
  parseEnv('jsonplaceholder', jsonPlaceholderSchema, source);

export const jsonPlaceholderConfig = buildJsonPlaceholderConfig(envSource);
