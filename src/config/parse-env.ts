import type { z } from 'zod';

export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Describes a Zod issue without echoing the offending value: env vars may hold secrets,
 * and Zod's default messages for enums/types include what was received.
 */
const describeIssue = (issue: z.ZodIssue): string => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'is required' : `must be a ${issue.expected}`;
    case 'invalid_enum_value':
      return `must be one of: ${issue.options.join(' | ')}`;
    default:
      return issue.message;
  }
};

/**
 * Validates one configuration group. On failure, throws a single error listing every
 * invalid variable of the group (names and rules only, never values) so that a broken
 * deployment is fixed in one pass instead of one variable per restart.
 */
export const parseEnv = <TSchema extends z.ZodTypeAny>(
  group: string,
  schema: TSchema,
  source: EnvSource,
): z.infer<TSchema> => {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data as z.infer<TSchema>;
  }

  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${describeIssue(issue)}`,
  );
  throw new Error(`Invalid environment configuration (${group}):\n${lines.join('\n')}`);
};

/**
 * Variables the boilerplate renamed or removed (value = what to do instead). A stale name would
 * otherwise be ignored silently (CORS quietly off, a millisecond window read as nothing), so
 * startup fails and says what to do. Add an entry whenever a variable is renamed or removed.
 */
export const RENAMED_ENV_VARS: Readonly<Record<string, string>> = {
  CORS_ORIGIN: 'renamed to CORS_ORIGINS (comma-separated exact origins; empty = CORS disabled)',
  RATE_LIMIT_WINDOW_MS: 'renamed to RATE_LIMIT_WINDOW_SECONDS (seconds, not milliseconds)',
  API_PREFIX:
    'renamed to API_BASE_PATH (without the version, e.g. /api; the version /v1 lives in code)',
  DB_SCHEMA:
    'removed — tables always live in the public schema (src/database/schema/schemas.ts); delete the line',
};

/** Fails fast when a renamed variable is still set; lists names only, never values. */
export const assertNoRenamedVariables = (
  source: EnvSource,
  renamed: Readonly<Record<string, string>> = RENAMED_ENV_VARS,
): void => {
  const stale = Object.keys(renamed).filter((name) => source[name] !== undefined);
  if (stale.length === 0) return;

  const lines = stale.map((name) => `  - ${name}: ${renamed[name] ?? ''}`);
  throw new Error(`Invalid environment configuration (renamed variables):\n${lines.join('\n')}`);
};

export const isTestEnvironment = (source: EnvSource): boolean => source.NODE_ENV === 'test';

/**
 * Env files Bun loads into every process by itself (always, or by NODE_ENV) — also into a child
 * process — mixed with the file an environment names (D62). None of them is used.
 */
export const AUTO_LOADED_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test.local',
] as const;

/**
 * Refuses to start while one of AUTO_LOADED_ENV_FILES exists: its values would be mixed silently
 * into the chosen environment (`bun run start:<environment>`). Tests run hermetic (their preload
 * replaces every service address), so they are not refused.
 */
export const assertNoAutoLoadedEnvFiles = (
  source: EnvSource,
  exists: (file: string) => boolean,
): void => {
  if (isTestEnvironment(source)) return;
  const found = AUTO_LOADED_ENV_FILES.filter(exists);
  if (found.length === 0) return;
  throw new Error(
    `CRITICAL STARTUP ERROR: ${found.join(', ')} found — Bun loads it into every process by itself, mixed with the environment you start.\n` +
      'Move what you need into .env.<environment> (bun run setup renames an old .env to .env.dev) and delete it.\n',
  );
};

/**
 * Fails fast with an actionable message when the process starts without any configuration: no
 * env file chosen (`bun run start:<environment>` / `bun run env …`) and no variables injected by
 * the platform (container, server, CI). Tests run on schema defaults.
 */
export const assertEnvironmentLoaded = (source: EnvSource): void => {
  if (isTestEnvironment(source) || source.DATABASE_URL) {
    return;
  }

  throw new Error(
    'CRITICAL STARTUP ERROR: no configuration loaded (DATABASE_URL is not set).\n' +
      'Locally, start through an environment: bun run start:dev (or bun run env <environment> <command>)\n' +
      'with .env.<environment> created from .env.example — bun run setup creates .env.dev.\n' +
      'In a container or on a server, inject the variables (docs/deployment.md).\n',
  );
};
