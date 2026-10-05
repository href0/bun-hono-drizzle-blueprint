import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertEnvironmentLoaded, assertNoRenamedVariables, type EnvSource } from './parse-env';

/**
 * The only place that reads `process.env`. Bun loads `.env` into it automatically;
 * every `*.config.ts` validates its own group from this source.
 */
export const envSource: EnvSource = process.env;

/**
 * The process runs in UTC whatever the host zone (plan D13): any `Date` local-time behaviour —
 * ours is banned by ESLint, but libraries may rely on it — is then the same on every machine.
 * Wall-clock logic uses explicit IANA zones through `src/utils/datetime.util.ts`.
 */
process.env.TZ = 'UTC';

assertEnvironmentLoaded(envSource, existsSync(resolve(process.cwd(), '.env')));
assertNoRenamedVariables(envSource);
