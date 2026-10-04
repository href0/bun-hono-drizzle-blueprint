import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertEnvironmentLoaded, assertNoRenamedVariables, type EnvSource } from './parse-env';

/**
 * The only place that reads `process.env`. Bun loads `.env` into it automatically;
 * every `*.config.ts` validates its own group from this source.
 */
export const envSource: EnvSource = process.env;

assertEnvironmentLoaded(envSource, existsSync(resolve(process.cwd(), '.env')));
assertNoRenamedVariables(envSource);
