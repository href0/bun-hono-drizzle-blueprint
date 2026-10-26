import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import packageJson from '../package.json';
import { scriptFilesOf, usageOf } from '../scripts/lib/commands';

/**
 * R83: every scripts/*.ts a package.json script runs answers `--help` / `-h` with its usage and exit
 * 0 without doing anything (`openapi:update --help` once wrote the snapshot, `test:int --help`
 * created a database), and refuses an unknown option with exit 1 — also without doing anything.
 */

const ROOT = resolve(import.meta.dir, '..');
const FILES = [...new Set(Object.values(packageJson.scripts).flatMap(scriptFilesOf))].sort();

const run = (args: string[], program = 'bun') => {
  const child = Bun.spawnSync([program, ...args], {
    cwd: ROOT,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    // A script that starts working instead of answering would hang or take minutes.
    timeout: 20_000,
  });
  return {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  };
};

const treeState = (): string =>
  run(['status', '--porcelain', '--untracked-files=all'], 'git').stdout;

describe('every script answers --help without side effects (R83)', () => {
  const before = treeState();

  it('finds the scripts to check', () => {
    expect(FILES).toContain('openapi.ts');
    expect(FILES).toContain('test-integration.ts');
  });

  it.each(FILES)('scripts/%s --help prints its usage and exits 0', (file) => {
    const result = run([`scripts/${file}`, '--help']);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(`${usageOf(file)}\n`);
    expect(result.exitCode).toBe(0);
  });

  it.each(FILES)('scripts/%s refuses an unknown option with exit 1', (file) => {
    const result = run([`scripts/${file}`, '--no-such-option']);
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('--no-such-option');
  });

  it('-h is --help, also after a subcommand', () => {
    const result = run(['scripts/openapi.ts', 'update', '-h']);
    expect(result.stdout).toBe(`${usageOf('openapi.ts')}\n`);
    expect(result.exitCode).toBe(0);
  });

  it('left the working tree as it was', () => {
    expect(treeState()).toBe(before);
  });
});
