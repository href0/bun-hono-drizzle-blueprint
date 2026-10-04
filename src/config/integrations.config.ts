import { z } from 'zod';
import { envSource } from './env-source';
import { parseEnv, type EnvSource } from './parse-env';

const integrationsSchema = z.object({
  JSONPLACEHOLDER_BASE_URL: z.string().url().default('https://jsonplaceholder.typicode.com'),
  JSONPLACEHOLDER_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type IntegrationsConfig = z.infer<typeof integrationsSchema>;

export const buildIntegrationsConfig = (source: EnvSource): IntegrationsConfig =>
  parseEnv('integrations', integrationsSchema, source);

export const integrationsConfig = buildIntegrationsConfig(envSource);
