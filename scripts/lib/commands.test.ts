import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import packageJson from '../../package.json';
import { DEFAULT_RETENTION_DAYS } from '../../src/database/maintenance/purge-refresh-tokens';
import {
  COMMAND_GROUPS,
  commandHelp,
  commandsHelp,
  SCRIPT_USAGE,
  scriptFilesOf,
  usageOf,
} from './commands';

const SCRIPTS: Record<string, string> = packageJson.scripts;
const registered = COMMAND_GROUPS.flatMap((group) => group.commands.map((c) => c.script));
const PLAIN = { width: 100, color: false };

describe('the help registry (R83)', () => {
  it('names every package.json script exactly once, and nothing else', () => {
    expect([...registered].sort()).toEqual(Object.keys(SCRIPTS).sort());
    expect(new Set(registered).size).toBe(registered.length);
  });

  it('every scripts/*.ts a package.json script runs has a usage, and every usage a script', () => {
    const run = new Set(Object.values(SCRIPTS).flatMap(scriptFilesOf));
    const onDisk = readdirSync(resolve(import.meta.dir, '..')).filter((name) =>
      name.endsWith('.ts'),
    );
    expect([...run].sort()).toEqual(onDisk.sort());
    expect(Object.keys(SCRIPT_USAGE).sort()).toEqual([...run].sort());
    for (const file of run) expect(usageOf(file)).toStartWith('Usage');
  });

  it('a summary is one informative line, not the name again', () => {
    for (const command of COMMAND_GROUPS.flatMap((group) => group.commands)) {
      expect(command.summary).not.toContain('\n');
      expect(command.summary.length).toBeGreaterThan(command.script.length + 10);
    }
  });

  it('the purge usage states the default retention', () => {
    expect(usageOf('purge-refresh-tokens.ts')).toContain(
      `default ${String(DEFAULT_RETENTION_DAYS)})`,
    );
  });

  it('a script without a usage is a programming error', () => {
    expect(() => usageOf('nope.ts')).toThrow('scripts/nope.ts has no entry in SCRIPT_USAGE');
  });

  it('finds the scripts/ files a command runs', () => {
    expect(scriptFilesOf('bun scripts/openapi.ts check')).toEqual(['openapi.ts']);
    expect(scriptFilesOf('bun test --coverage && bun scripts/check-coverage.ts')).toEqual([
      'check-coverage.ts',
    ]);
    expect(scriptFilesOf('eslint src test scripts')).toEqual([]);
  });
});

describe('bun run help', () => {
  it('prints every script in its group, without colours in a pipe', () => {
    const text = commandsHelp('demo', SCRIPTS, PLAIN);
    expect(text).toStartWith('demo — bun run <command>\n');
    for (const script of registered) expect(text).toMatch(new RegExp(`^  ${script} +[ *] `, 'm'));
    expect(text).toContain('\nQuality gates\n');
    expect(text).toMatch(/^ {2}db:migrate +\* Apply the migrations/m);
    expect(text).toContain('bun run help <command>');
    expect(text).not.toContain('\u001b[');
  });

  it('prints only the scripts the project has; an empty group disappears', () => {
    const text = commandsHelp(
      'demo',
      { dev: 'bun --watch src/index.ts', help: 'bun scripts/help.ts' },
      PLAIN,
    );
    expect(text).toContain('  dev ');
    expect(text).not.toContain('partner:sign');
    expect(text).not.toContain('Partner gateway');
    expect(text).not.toContain('Database');
  });

  it('wraps a long summary under itself in a narrow terminal', () => {
    const lines = commandsHelp('demo', SCRIPTS, { width: 60, color: false }).split('\n');
    expect(lines.every((line) => line.length <= 60 || !line.includes(' '))).toBe(true);
    const first = lines.findIndex((line) => line.startsWith('  setup '));
    const indent = lines[first]?.indexOf('Turn a fresh clone') ?? -1;
    expect(lines[first + 1]?.slice(0, indent).trim()).toBe('');
  });

  it('colours only when asked', () => {
    expect(commandsHelp('demo', SCRIPTS, { width: 100, color: true })).toContain('\u001b[1mdemo');
  });

  it('help <command>: what it does, what it runs, its usage', () => {
    const text = commandHelp('openapi:update', SCRIPTS);
    expect(text).toStartWith('bun run openapi:update — Write the snapshot');
    expect(text).toContain('Runs: bun scripts/openapi.ts update');
    expect(text).toContain(usageOf('openapi.ts'));
    expect(commandHelp('db:migrate', SCRIPTS)).toContain('* run by a developer');
    expect(commandHelp('lint', SCRIPTS)).not.toContain('Usage');
  });

  it('help <unknown>: refused with where to look', () => {
    expect(() => commandHelp('deploy', SCRIPTS)).toThrow('unknown command "deploy"');
    expect(() => commandHelp('dev', {})).toThrow('unknown command "dev"');
  });
});
