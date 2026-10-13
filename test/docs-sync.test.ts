import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
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

/**
 * ARCHITECTURE.md §12 indexes every rule with the machine that enforces it. A label that points at
 * nothing (a renamed ESLint group, a deleted test) would make the index lie, and a rule added to
 * ESLint or dependency-cruiser without a row would stay unexplained: both fail here.
 */

const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');
const architecture = read('ARCHITECTURE.md');
const eslintConfig = read('eslint.config.mjs');
const depcruiseConfig = read('.dependency-cruiser.cjs');

/** Documents that carry enforcer labels. */
const LABELLED_DOCS = [
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  '.agents/AGENTS.md',
  '.agents/skills/project-standards/SKILL.md',
];

/** ESLint groups made only of other groups: indexed through their parts. */
const COMPOSITE_ESLINT_GROUPS = ['SOURCE_SYNTAX_RULES', 'MODULE_DATA_RULES'];

const firstCaptures = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((match) => match.at(1) ?? '').filter((name) => name !== '');

const ciJobs = new Set(
  firstCaptures(
    read('.github/workflows/ci.yml')
      .split(/^jobs:\s*$/m)
      .at(1) ?? '',
    /^ {2}([\w-]+):/gm,
  ),
);
const testFileNames = new Set(
  ['src', 'test'].flatMap((dir) =>
    readdirSync(resolve(ROOT, dir), { recursive: true, encoding: 'utf8' }).map((path) =>
      basename(path),
    ),
  ),
);

/** Label kinds and how their target is found; `null` = the kind takes no target. */
const LABEL_TARGETS = new Map<string, ((target: string) => boolean) | null>([
  ['tsc', null],
  ['ls-lint', null],
  ['review-only', null],
  [
    'eslint',
    (target) =>
      new RegExp(`^const ${escapeRegExp(target)} =|'${escapeRegExp(target)}':`, 'm').test(
        eslintConfig,
      ),
  ],
  ['depcruise', (target) => depcruiseConfig.includes(`name: '${target}'`)],
  [
    'test',
    (target) => testFileNames.has(`${target}.test.ts`) || testFileNames.has(`${target}.int.ts`),
  ],
  ['script', (target) => Object.keys(packageJson.scripts).includes(target)],
  ['ci', (target) => ciJobs.has(target)],
  ['hook', (target) => existsSync(resolve(ROOT, target))],
]);

/** `[kind]` or `[kind:target]`, not a markdown link (`[text](url)`). */
const LABEL = /\[([a-z][a-z-]*)(?::([^\]\s]+))?\](?!\()/g;

/** Labels in `text` that are malformed or point at nothing. Placeholders (`<name>`) are skipped. */
const invalidLabels = (text: string): string[] =>
  [...text.matchAll(LABEL)].flatMap((match) => {
    const label = match[0];
    const kind = match.at(1) ?? '';
    const target = match.at(2);
    const check = LABEL_TARGETS.get(kind);
    if (target === undefined) {
      // A bare word in brackets is only a label when it is a known kind.
      return check ? [label] : [];
    }
    if (target.startsWith('<') && target.endsWith('>')) return [];
    return check?.(target) ? [] : [label];
  });

const labelsIn = (text: string): string[] =>
  [...text.matchAll(LABEL)]
    .filter((match) => LABEL_TARGETS.has(match.at(1) ?? ''))
    .map((m) => m[0]);

const indexRows = architecture.split('\n').filter((line) => /^\| R\d{2} \|/.test(line));
const indexIds = indexRows.map((row) => row.slice(2, 5));

describe('ARCHITECTURE.md rule index (R01…) and enforcer labels', () => {
  it('every enforcer label points at an existing rule, group, test, script, CI job or hook', () => {
    const invalid = LABELLED_DOCS.flatMap((path) =>
      invalidLabels(read(path)).map((label) => `${path}: ${label}`),
    );
    expect(invalid).toEqual([]);
  });

  it('rule IDs run R01, R02, … without gaps or duplicates', () => {
    expect(indexIds.length).toBeGreaterThan(0);
    expect(indexIds).toEqual(indexIds.map((_, i) => `R${String(i + 1).padStart(2, '0')}`));
  });

  it('every rule names at least one enforcer (or [review-only])', () => {
    const unlabelled = indexRows.filter(
      (row) => labelsIn(row.split('|').at(-2) ?? '').length === 0,
    );
    expect(unlabelled).toEqual([]);
  });

  it('every rule ID referenced in the text exists in the index', () => {
    const referenced = new Set(firstCaptures(architecture, /\b(R\d{2})\b/g));
    expect([...referenced].filter((id) => !indexIds.includes(id))).toEqual([]);
  });

  it('every dependency-cruiser rule and ESLint group has a row', () => {
    const groups = firstCaptures(
      eslintConfig,
      /^const ([A-Z][A-Z_]*_(?:RULES|PATTERN|PATTERNS)) =/gm,
    );
    expect(COMPOSITE_ESLINT_GROUPS.filter((name) => !groups.includes(name))).toEqual([]);
    const required = [
      ...firstCaptures(depcruiseConfig, /name: '([\w-]+)'/g).map((name) => `[depcruise:${name}]`),
      ...groups
        .filter((name) => !COMPOSITE_ESLINT_GROUPS.includes(name))
        .map((name) => `[eslint:${name}]`),
      '[eslint:local/inbound-channel]',
    ];
    const indexed = indexRows.join('\n');
    expect(required.filter((label) => !indexed.includes(label))).toEqual([]);
  });
});

describe('README.md', () => {
  it('stays a quickstart (at most 150 lines; details live in ARCHITECTURE and CONTRIBUTING)', () => {
    expect(read('README.md').trimEnd().split('\n').length).toBeLessThanOrEqual(150);
  });
});
