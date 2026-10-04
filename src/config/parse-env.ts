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
 * Variables the boilerplate renamed. A stale name would otherwise be ignored silently (CORS quietly
 * off, a millisecond window read as nothing), so startup fails and names the replacement.
 * Add an entry whenever a variable is renamed or removed.
 */
export const RENAMED_ENV_VARS: Readonly<Record<string, string>> = {
  CORS_ORIGIN: 'CORS_ORIGINS (comma-separated exact origins; empty = CORS disabled)',
  RATE_LIMIT_WINDOW_MS: 'RATE_LIMIT_WINDOW_SECONDS (seconds, not milliseconds)',
  API_PREFIX: 'API_BASE_PATH (without the version, e.g. /api; the version /v1 lives in code)',
};

/** Fails fast when a renamed variable is still set; lists names only, never values. */
export const assertNoRenamedVariables = (
  source: EnvSource,
  renamed: Readonly<Record<string, string>> = RENAMED_ENV_VARS,
): void => {
  const stale = Object.keys(renamed).filter((name) => source[name] !== undefined);
  if (stale.length === 0) return;

  const lines = stale.map((name) => `  - ${name}: renamed to ${renamed[name] ?? ''}`);
  throw new Error(`Invalid environment configuration (renamed variables):\n${lines.join('\n')}`);
};

export const isTestEnvironment = (source: EnvSource): boolean => source.NODE_ENV === 'test';

/**
 * Fails fast with an actionable message when the process starts without any configuration:
 * no `.env` file and no injected variables (container / CI). Tests run on schema defaults.
 */
export const assertEnvironmentLoaded = (source: EnvSource, envFileExists: boolean): void => {
  if (isTestEnvironment(source) || envFileExists || source.DATABASE_URL) {
    return;
  }

  throw new Error(
    'CRITICAL STARTUP ERROR: Configuration file `.env` is missing.\n' +
      'The application cannot start without database and service configurations.\n' +
      'Please copy `.env.example` to `.env` and configure your credentials:\n' +
      '  cp .env.example .env\n',
  );
};
