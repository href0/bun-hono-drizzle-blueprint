/**
 * `bun run env <environment> <command>` (scripts/with-env.ts): every local command runs against an
 * environment named on the command line, never an env file Bun happens to find. The plan is pure —
 * the script does the I/O. The API itself starts through `start:<environment>` (`bun --env-file`
 * straight to the server: no process in between, so Ctrl+C never returns the prompt early).
 *
 * Bun loads `.env`, `.env.local` and `.env.<NODE_ENV>` into every process on its own; `--env-file`
 * replaces that for the process it is given to, but a script's own child process (`bun scripts/…`,
 * drizzle-kit) loads them again. So the plan refuses to run while such a file exists: the chosen
 * file would silently be mixed with it (the app refuses the same at startup).
 */
import { AUTO_LOADED_ENV_FILES } from '../../src/config/parse-env';

/** The environments a project runs locally, each with its own file `.env.<name>`. */
export const ENVIRONMENTS = ['dev', 'test', 'stg', 'demo', 'prod'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** Environments an AI agent may use (`.agents/AGENTS.md`); the others are refused by the hook. */
export const AGENT_ENVIRONMENTS: readonly Environment[] = ['dev', 'test'];

export const envFileOf = (environment: Environment): string => `.env.${environment}`;

export const isEnvironment = (value: string): value is Environment =>
  (ENVIRONMENTS as readonly string[]).includes(value);

export interface EnvPlan {
  environment: Environment;
  envFile: string;
  /** The `bun` arguments to spawn. */
  bunArgs: string[];
}

export class EnvPlanError extends Error {}

/** What `bun run env <environment> <command> [args…]` runs: a `package.json` script with the chosen file. */
export const planWithEnv = (
  argv: readonly string[],
  scripts: Readonly<Record<string, string>>,
  fileExists: (path: string) => boolean,
): EnvPlan => {
  const environment = argv.at(0);
  const command = argv.at(1);
  const rest = argv.slice(2);
  if (environment === undefined) throw new EnvPlanError('name an environment and a command');
  if (!isEnvironment(environment)) {
    throw new EnvPlanError(
      `unknown environment "${environment}": one of ${ENVIRONMENTS.join(', ')}`,
    );
  }
  if (command === undefined) throw new EnvPlanError(`name the command to run with ${environment}`);
  const stray = AUTO_LOADED_ENV_FILES.filter(fileExists);
  if (stray.length > 0) {
    throw new EnvPlanError(
      `${stray.join(', ')} found: Bun loads it into every process by itself, mixed with the environment you name. ` +
        `Rename it to ${envFileOf('dev')} (or the file of its environment) and run again.`,
    );
  }
  const envFile = envFileOf(environment);
  if (!fileExists(envFile)) {
    throw new EnvPlanError(
      `${envFile} not found: create it from .env.example (bun run setup creates ${envFileOf('dev')})`,
    );
  }
  const withFile = `--env-file=${envFile}`;
  if (command === 'start') {
    throw new EnvPlanError(`start the API with bun run start:${environment}`);
  }
  if (command === 'env' || command.startsWith('start:')) {
    throw new EnvPlanError(`"${command}" already chooses an environment: run it directly`);
  }
  if (!(command in scripts)) {
    throw new EnvPlanError(`unknown command "${command}": bun run help lists every command`);
  }
  return { environment, envFile, bunArgs: [withFile, 'run', command, ...rest] };
};

/** `postgresql://user:secret@db.example.com:5432/app_db` → `db.example.com:5432/app_db` (no credentials). */
export const describeDatabase = (databaseUrl: string | undefined): string => {
  if (databaseUrl === undefined || databaseUrl === '') return 'DATABASE_URL not set';
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return 'DATABASE_URL is not a URL';
  }
};
