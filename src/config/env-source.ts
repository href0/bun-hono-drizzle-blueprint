import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertEnvironmentLoaded, assertNoRenamedVariables, type EnvSource } from './parse-env';

/**
 * The only place that reads `process.env`. Bun loads `.env` into it automatically;
 * every `*.config.ts` validates its own group from this source.
 */
export const envSource: EnvSource = process.env;

/**
 * The host machine's own zone, read before the switch to UTC below. Display only: development logs
 * show times in the zone of whoever runs the app, wherever they are; nothing else may use it.
 */
export const hostTimeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The process runs in UTC whatever the host zone (D13): any `Date` local-time behaviour —
 * ours is banned by ESLint, but libraries may rely on it — is then the same on every machine.
 * Wall-clock logic uses explicit IANA zones through `src/utils/datetime.util.ts`.
 */
process.env.TZ = 'UTC';

assertEnvironmentLoaded(envSource, existsSync(resolve(process.cwd(), '.env')));
assertNoRenamedVariables(envSource);
