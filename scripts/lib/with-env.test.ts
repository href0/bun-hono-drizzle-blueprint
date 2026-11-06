import { describe, expect, it } from 'bun:test';
import { AUTO_LOADED_ENV_FILES } from '../../src/config/parse-env';
import { describeDatabase, ENVIRONMENTS, EnvPlanError, envFileOf, planWithEnv } from './with-env';

const SCRIPTS = { 'db:migrate': 'drizzle-kit migrate', 'seed:admin': 'bun scripts/seed-admin.ts' };

/** A project folder holding exactly `files`. */
const only =
  (...files: string[]) =>
  (path: string): boolean =>
    files.includes(path);

const refusal = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvPlanError) return error.message;
    throw error;
  }
  throw new Error('expected an EnvPlanError');
};

describe('bun run env <environment> <command>', () => {
  it('has one file per environment', () => {
    expect(ENVIRONMENTS.map(envFileOf)).toEqual([
      '.env.dev',
      '.env.test',
      '.env.stg',
      '.env.demo',
      '.env.prod',
    ]);
  });

  it('runs a package.json script with that file only, passing its arguments on', () => {
    const plan = planWithEnv(
      ['stg', 'seed:admin', '--email', 'a@example.com'],
      SCRIPTS,
      only('.env.stg'),
    );
    expect(plan).toEqual({
      environment: 'stg',
      envFile: '.env.stg',
      bunArgs: ['--env-file=.env.stg', 'run', 'seed:admin', '--email', 'a@example.com'],
    });
  });

  it('leaves the API to start:<environment> (no launcher between the terminal and the server)', () => {
    expect(refusal(() => planWithEnv(['dev', 'start'], SCRIPTS, only('.env.dev')))).toBe(
      'start the API with bun run start:dev',
    );
  });

  it('refuses while any file Bun loads by itself exists — it would be mixed in', () => {
    for (const stray of AUTO_LOADED_ENV_FILES) {
      expect(
        refusal(() => planWithEnv(['dev', 'db:migrate'], SCRIPTS, only('.env.dev', stray))),
      ).toContain(`${stray} found`);
    }
  });

  it('refuses a missing file, naming where it comes from', () => {
    expect(refusal(() => planWithEnv(['demo', 'db:migrate'], SCRIPTS, only()))).toBe(
      '.env.demo not found: create it from .env.example (bun run setup creates .env.dev)',
    );
  });

  it('refuses an unknown environment or command, and a command that chooses its own', () => {
    expect(refusal(() => planWithEnv([], SCRIPTS, only()))).toBe(
      'name an environment and a command',
    );
    expect(refusal(() => planWithEnv(['production', 'db:migrate'], SCRIPTS, only()))).toContain(
      'unknown environment "production"',
    );
    expect(refusal(() => planWithEnv(['dev'], SCRIPTS, only('.env.dev')))).toBe(
      'name the command to run with dev',
    );
    expect(refusal(() => planWithEnv(['dev', 'deploy'], SCRIPTS, only('.env.dev')))).toContain(
      'unknown command "deploy"',
    );
    expect(refusal(() => planWithEnv(['dev', 'start:prod'], SCRIPTS, only('.env.dev')))).toContain(
      'already chooses an environment',
    );
    expect(refusal(() => planWithEnv(['dev', 'env'], SCRIPTS, only('.env.dev')))).toContain(
      'already chooses an environment',
    );
  });
});

describe('describeDatabase', () => {
  it('shows host, port and database, never the credentials', () => {
    const shown = describeDatabase('postgresql://admin:s3cret@db.example.com:5432/app_db');
    expect(shown).toBe('db.example.com:5432/app_db');
    expect(shown).not.toContain('s3cret');
  });

  it('says what is wrong instead of a target', () => {
    expect(describeDatabase(undefined)).toBe('DATABASE_URL not set');
    expect(describeDatabase('')).toBe('DATABASE_URL not set');
    expect(describeDatabase('not a url')).toBe('DATABASE_URL is not a URL');
  });
});
