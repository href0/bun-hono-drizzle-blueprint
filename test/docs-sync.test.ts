import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import packageJson from '../package.json';

/**
 * CONTRIBUTING.md is the canonical map of the repository (§2.1 tree, §1 command table) that
 * developers and agents both follow. Every review so far found it behind the code; this test makes
 * that drift fail instead: each script, test area, helper and module must be named there.
 */

const ROOT = resolve(import.meta.dir, '..');
const contributing = readFileSync(resolve(ROOT, 'CONTRIBUTING.md'), 'utf8');

const entries = (dir: string): string[] => readdirSync(resolve(ROOT, dir));
const isDirectory = (path: string): boolean => statSync(resolve(ROOT, path)).isDirectory();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Names that `text` does not mention as a whole name: `integration.ts` inside
 * `test-integration.ts`, or `auth` inside `auth-fakes`, does not count. `label` turns a name into
 * what must appear (a folder `name/` may be followed by its files).
 */
const missingFrom = (text: string, names: string[], label = (name: string) => name): string[] =>
  names.filter((name) => {
    const wanted = label(name);
    const end = wanted.endsWith('/') ? '' : '(?![\\w-])';
    return !new RegExp(`(?<![\\w./-])${escapeRegExp(wanted)}${end}`).test(text);
  });

describe('CONTRIBUTING.md names everything a contributor works with', () => {
  it('every script in scripts/ and scripts/lib/', () => {
    const scripts = entries('scripts').filter((name) => name.endsWith('.ts'));
    const libs = entries('scripts/lib').map((name) => `lib/${name}`);
    expect(missingFrom(contributing, [...scripts, ...libs])).toEqual([]);
  });

  it('every folder under test/, every helper and every integration area', () => {
    const folders = entries('test').filter((name) => isDirectory(`test/${name}`));
    const helpers = entries('test/helpers');
    const areas = entries('test/integration')
      .filter((name) => name.endsWith('.int.ts'))
      .map((name) => name.replace(/\.int\.ts$/, ''));
    // Areas are short words (auth, redis): they must appear on the tree line of integration/.
    const integrationLine =
      contributing.split('\n').find((line) => line.includes('── integration/')) ?? '';
    expect([
      ...missingFrom(contributing, folders, (name) => `${name}/`),
      ...missingFrom(contributing, helpers),
      ...missingFrom(integrationLine, areas),
    ]).toEqual([]);
  });

  it('every test file at the top of test/ (e2e suites by name, guards by file name)', () => {
    const files = entries('test').filter((name) => name.endsWith('.test.ts'));
    const e2e = files
      .filter((name) => name.endsWith('.e2e.test.ts'))
      .map((name) => name.replace(/\.e2e\.test\.ts$/, ''));
    const guards = files.filter((name) => !name.endsWith('.e2e.test.ts'));
    expect([...missingFrom(contributing, e2e), ...missingFrom(contributing, guards)]).toEqual([]);
  });

  it('every module folder in src/modules/', () => {
    const modules = entries('src/modules').filter((name) => isDirectory(`src/modules/${name}`));
    expect(missingFrom(contributing, modules, (name) => `${name}/`)).toEqual([]);
  });

  it('every package.json script in the command table', () => {
    const scripts = Object.keys(packageJson.scripts).filter((name) => name !== 'prepare');
    // Exact command, not a prefix: `bun run lint` must not be satisfied by `bun run lint:ls`.
    const listed = (name: string): boolean => {
      const command = name === 'test' ? 'bun test' : `bun run ${name}`;
      return contributing.includes(`\`${command}\``) || contributing.includes(`\`${command} `);
    };
    expect(scripts.filter((name) => !listed(name))).toEqual([]);
  });
});
