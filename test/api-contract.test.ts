import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Wiring of the API contract snapshot (plan D34, R76): `openapi:check` runs wherever the gates run,
 * and `openapi:update` — accepting a contract change — is never run by a machine on its own.
 */
const ROOT = resolve(import.meta.dir, '..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf-8');
const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

/** Text of every file in a folder (non-recursive). */
const filesIn = (dir: string): [string, string][] =>
  readdirSync(resolve(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => [`${dir}/${entry.name}`, read(`${dir}/${entry.name}`)]);

const UPDATE = /openapi:update|openapi\.ts['"]?,?\s*['"]?update/;

describe('API contract gate wiring', () => {
  it('openapi:check is part of validate (pre-push) and of the CI verify job', () => {
    expect(packageJson.scripts.validate).toContain('bun run openapi:check');
    expect(read('.husky/pre-push')).toContain('bun run validate');
    expect(read('.github/workflows/ci.yml')).toContain('run: bun run openapi:check');
  });

  it('no hook, CI workflow or the scaffold CLI ever runs openapi:update', () => {
    const machines = [
      ...filesIn('.husky'),
      ...filesIn('.github/workflows'),
      ['scripts/scaffold.ts', read('scripts/scaffold.ts')],
      ['scripts/lib/scaffold.ts', read('scripts/lib/scaffold.ts')],
    ];
    // The scaffold CLI may only *tell* the developer to run it: the printed CONTRACT_REMINDER.
    const withoutReminder = (text: string): string =>
      text.replace(/CONTRACT_REMINDER =\s*'[^']*'/, 'CONTRACT_REMINDER = <reminder>');
    const offenders = machines
      .filter(([, text]) => UPDATE.test(withoutReminder(text)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
    expect(read('scripts/scaffold.ts')).toMatch(/CONTRACT_REMINDER =\s*'[^']*openapi:update/);
  });
});
