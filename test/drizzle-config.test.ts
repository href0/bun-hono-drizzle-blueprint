import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * R87: drizzle-kit never falls back to a default database. The config is loaded as drizzle-kit
 * loads it, in an empty folder (Bun would load an env file from the working directory) and with
 * only PATH / HOME in the environment.
 */

const CONFIG = resolve(import.meta.dir, '../drizzle.config.ts');

const load = (command: string, databaseUrl?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'drizzle-config-'));
  try {
    const child = Bun.spawnSync(
      [
        'bun',
        '-e',
        `const c = await import(${JSON.stringify(CONFIG)}); console.log(c.default.dbCredentials.url)`,
        command,
      ],
      {
        cwd: dir,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          ...(databaseUrl === undefined ? {} : { DATABASE_URL: databaseUrl }),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    return {
      exitCode: child.exitCode,
      stdout: child.stdout.toString(),
      stderr: child.stderr.toString(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('drizzle.config.ts', () => {
  it('refuses migrate and studio without DATABASE_URL, naming the launcher', () => {
    for (const command of ['migrate', 'studio']) {
      const result = load(command);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(`drizzle-kit ${command}: DATABASE_URL is not set`);
      expect(result.stderr).toContain('bun run env <dev|test|…>');
    }
  });

  it('lets generate run offline, and migrate use the DATABASE_URL it is given', () => {
    expect(load('generate').exitCode).toBe(0);
    const given = load('migrate', 'postgresql://u:p@db.example.com:5432/app_db');
    expect(given.exitCode).toBe(0);
    expect(given.stdout.trim()).toBe('postgresql://u:p@db.example.com:5432/app_db');
  });
});
