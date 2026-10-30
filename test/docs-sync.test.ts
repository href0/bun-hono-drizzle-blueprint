import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import packageJson from '../package.json';
import { ACCEPTANCE_STEPS } from '../scripts/lib/acceptance';

/**
 * Every coding standard lives in one file under docs/standards/ (documentation.md), read by
 * developers and agents alike. Every review so far found a document behind the code or two
 * documents disagreeing; these guards make that drift fail instead.
 */

const ROOT = resolve(import.meta.dir, '..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');
const entries = (dir: string): string[] => readdirSync(resolve(ROOT, dir));
const isDirectory = (path: string): boolean => statSync(resolve(ROOT, path)).isDirectory();
const lines = (text: string): string[] => text.split(/\r?\n/);

const STANDARDS_DIR = 'docs/standards';
const standards = entries(STANDARDS_DIR).filter((name) => name.endsWith('.md'));
const structure = read(`${STANDARDS_DIR}/structure.md`);
const qualityGates = read(`${STANDARDS_DIR}/quality-gates.md`);

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

describe('structure.md and quality-gates.md name everything a contributor works with', () => {
  it('every script in scripts/ and scripts/lib/', () => {
    const scripts = entries('scripts').filter((name) => name.endsWith('.ts'));
    const libs = entries('scripts/lib').map((name) => `lib/${name}`);
    expect(missingFrom(structure, [...scripts, ...libs])).toEqual([]);
  });

  it('every folder under test/, every helper and every integration area', () => {
    const folders = entries('test').filter((name) => isDirectory(`test/${name}`));
    const helpers = entries('test/helpers');
    const areas = entries('test/integration')
      .filter((name) => name.endsWith('.int.ts'))
      .map((name) => name.replace(/\.int\.ts$/, ''));
    // Areas are short words (auth, redis): they must appear on the tree line of integration/, or
    // as their own `<area>.int.ts` entry (an area of an optional feature, removed with it).
    const integrationLine = lines(structure).find((line) => line.includes('── integration/')) ?? '';
    expect([
      ...missingFrom(structure, folders, (name) => `${name}/`),
      ...missingFrom(structure, helpers),
      ...missingFrom(integrationLine, areas).filter(
        (area) => !structure.includes(`${area}.int.ts`),
      ),
    ]).toEqual([]);
  });

  it('every test file at the top of test/ (e2e suites by name, guards by file name)', () => {
    const files = entries('test').filter((name) => name.endsWith('.test.ts'));
    const e2e = files
      .filter((name) => name.endsWith('.e2e.test.ts'))
      .map((name) => name.replace(/\.e2e\.test\.ts$/, ''));
    const guards = files.filter((name) => !name.endsWith('.e2e.test.ts'));
    expect([...missingFrom(structure, e2e), ...missingFrom(structure, guards)]).toEqual([]);
  });

  it('every module folder in src/modules/', () => {
    const modules = entries('src/modules').filter((name) => isDirectory(`src/modules/${name}`));
    expect(missingFrom(structure, modules, (name) => `${name}/`)).toEqual([]);
  });

  it('every package.json script in the command table', () => {
    const scripts = Object.keys(packageJson.scripts).filter((name) => name !== 'prepare');
    // Exact command, not a prefix: `bun run lint` must not be satisfied by `bun run lint:ls`.
    const listed = (name: string): boolean => {
      const command = name === 'test' ? 'bun test' : `bun run ${name}`;
      return qualityGates.includes(`\`${command}\``) || qualityGates.includes(`\`${command} `);
    };
    expect(scripts.filter((name) => !listed(name))).toEqual([]);
  });
});

/**
 * ARCHITECTURE.md §12 indexes every rule with the machine that enforces it. A label that points at
 * nothing (a renamed ESLint group, a deleted test) would make the index lie, and a rule added to
 * ESLint or dependency-cruiser without a row would stay unexplained: both fail here.
 */

const architecture = read('ARCHITECTURE.md');
const eslintConfig = read('eslint.config.mjs');
const depcruiseConfig = read('.dependency-cruiser.cjs');

/** Documents that carry enforcer labels. */
const LABELLED_DOCS = [
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  '.agents/AGENTS.md',
  '.agents/skills/project-standards/SKILL.md',
  ...standards.map((name) => `${STANDARDS_DIR}/${name}`),
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
  ['src', 'test', 'scripts'].flatMap((dir) =>
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

const indexRows = lines(architecture).filter((line) => /^\| R\d{2} \|/.test(line));
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

/**
 * One source per topic: routers (AGENTS.md, CONTRIBUTING.md, the project-standards and
 * env-protection skills) point at docs/standards/ instead of restating it, and every link between
 * documents keeps working when a file or section moves.
 */

/** Maintained documents (work plans are temporary: their links are not maintained). */
const markdownBelow = (dir: string): string[] =>
  readdirSync(resolve(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.md'))
    .map((path) => `${dir}/${path.split('\\').join('/')}`);
const MAINTAINED_DOCS = [
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'README.md',
  'CLAUDE.md',
  ...entries('docs')
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/${name}`),
  ...markdownBelow(STANDARDS_DIR),
  // Generated (bun run openapi:update), but read by integrators: their links must resolve too.
  ...markdownBelow('docs/api'),
  ...markdownBelow('.agents'),
  ...markdownBelow('.claude'),
];

/** Routers and their line budgets: they grow only by restating a standard. */
const ROUTERS = new Map([
  ['.agents/AGENTS.md', 60],
  ['CONTRIBUTING.md', 70],
  ['.agents/skills/project-standards/SKILL.md', 45],
  ['.agents/skills/env-protection/SKILL.md', 15],
  ['.agents/skills/finish-change/SKILL.md', 20],
]);

/** The text outside fenced code blocks (``` … ```). */
const prose = (text: string): string => text.replace(/^```[\s\S]*?^```/gm, '');

/** GitHub heading anchors of a document, duplicates numbered (`-1`, `-2`). */
const anchorsOf = (text: string): Set<string> => {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const line of lines(prose(text))) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.at(1);
    if (heading === undefined) continue;
    const slug = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = seen.get(slug) ?? 0;
    anchors.add(count === 0 ? slug : `${slug}-${String(count)}`);
    seen.set(slug, count + 1);
  }
  return anchors;
};

/** Relative markdown links (file and `#anchor`) in `path` that point at nothing. */
const brokenLinks = (path: string): string[] => {
  const text = read(path);
  return [...prose(text).matchAll(/\]\(([^)\s]+)\)/g)].flatMap((match) => {
    const link = match.at(1) ?? '';
    if (/^[a-z]+:/i.test(link)) return [];
    const parts = link.split('#');
    const file = parts.at(0) ?? '';
    const anchor = parts.at(1);
    const target = file === '' ? resolve(ROOT, path) : resolve(ROOT, dirname(path), file);
    if (!existsSync(target)) return [`${path}: ${link}`];
    if (anchor === undefined || !target.endsWith('.md')) return [];
    const targetText = readFileSync(target, 'utf8');
    return anchorsOf(targetText).has(anchor) ? [] : [`${path}: ${link}`];
  });
};

/**
 * `<file>.md §N` references (`quality-gates.md §4`, `[database.md](database.md) §6`): the file
 * exists and has that section — a numbered heading (`## 4.`, `### 2.6`), or a numbered list item
 * (`6. …`) in a document that has no numbered headings. Routers and skills point at sections by number, so renumbering or
 * dropping a section must fail here instead of leaving them pointing at nothing.
 */
const SECTION_REFERENCE =
  /(?:\[[^\]]*\]\(([^)#\s]+\.md)(?:#[^)]*)?\)|`?([\w./-]+\.md)`?)\s*§(\d+(?:\.\d+)?)/g;

const sectionTarget = (doc: string, link: string | undefined, name: string): string | undefined => {
  const candidates =
    link === undefined
      ? [name, `${dirname(doc)}/${name}`, `${STANDARDS_DIR}/${name}`, `docs/${name}`]
      : [`${dirname(doc)}/${link}`];
  return candidates.map((path) => resolve(ROOT, path)).find((path) => existsSync(path));
};

const brokenSectionReferences = (doc: string): string[] =>
  [...prose(read(doc)).matchAll(SECTION_REFERENCE)].flatMap((match) => {
    const name = match.at(1) ?? match.at(2) ?? '';
    const section = match.at(3) ?? '';
    const target = sectionTarget(doc, match.at(1), name);
    if (target === undefined) return [`${doc}: ${name} §${section} → no such file`];
    const text = prose(readFileSync(target, 'utf8'));
    const escaped = section.split('.').join('\\.');
    const heading = new RegExp(`^#{2,4} ${escaped}[.\\s]`, 'm');
    const listItem = new RegExp(`^${escaped}\\. `, 'm');
    // A numbered list item counts only in a document without numbered headings (configuration.md).
    const numberedHeadings = /^#{2,4} \d/m.test(text);
    return heading.test(text) ||
      (!numberedHeadings && !section.includes('.') && listItem.test(text))
      ? []
      : [`${doc}: ${name} §${section} → no such section`];
  });

describe('docs/standards/ is the single source of the standards', () => {
  it('every relative link and #anchor in the maintained documents resolves', () => {
    expect(MAINTAINED_DOCS.flatMap(brokenLinks)).toEqual([]);
  });

  it('every "<file>.md §N" reference points at an existing section', () => {
    expect(MAINTAINED_DOCS.flatMap(brokenSectionReferences)).toEqual([]);
  });

  it('every docs/standards/… or .agents/….md path named in a document exists', () => {
    const missing = MAINTAINED_DOCS.flatMap((path) =>
      firstCaptures(read(path), /((?:docs\/standards|\.agents)\/[\w./-]+\.md)/g)
        .filter((named) => !existsSync(resolve(ROOT, named)))
        .map((named) => `${path}: ${named}`),
    );
    expect(missing).toEqual([]);
  });

  it('every standards file is listed in CONTRIBUTING.md and in the project-standards router', () => {
    const contributing = read('CONTRIBUTING.md');
    const router = read('.agents/skills/project-standards/SKILL.md');
    const unlisted = standards.flatMap((name) => [
      ...(contributing.includes(`${STANDARDS_DIR}/${name}`) ? [] : [`CONTRIBUTING.md: ${name}`]),
      ...(router.includes(`${STANDARDS_DIR}/${name}`) ? [] : [`project-standards: ${name}`]),
    ]);
    expect(unlisted).toEqual([]);
  });

  it('routers hold no code blocks and stay within their line budget', () => {
    const offending = [...ROUTERS].flatMap(([path, budget]) => {
      const text = read(path);
      const size = lines(text.trimEnd()).length;
      return [
        ...(text.includes('```') ? [`${path}: code block`] : []),
        ...(size > budget ? [`${path}: ${String(size)} lines > ${String(budget)}`] : []),
      ];
    });
    expect(offending).toEqual([]);
  });

  it('the project-standards skill keeps no references/ of its own', () => {
    const folder = resolve(ROOT, '.agents/skills/project-standards/references');
    expect(existsSync(folder) ? [relative(ROOT, folder)] : []).toEqual([]);
  });

  it('README.md stays a quickstart (at most 150 lines)', () => {
    expect(lines(read('README.md').trimEnd()).length).toBeLessThanOrEqual(150);
  });
});

/** The acceptance run is documented step by step: the list in its document is the runner's. */
describe('manual-acceptance.md lists the steps of bun run acceptance', () => {
  it('names every step of scripts/lib/acceptance.ts, in order', () => {
    const documented = lines(read(`${STANDARDS_DIR}/manual-acceptance.md`)).flatMap((line) => {
      const title = /^\d+\. \*\*(.+?)\*\*/.exec(line)?.at(1);
      return title === undefined ? [] : [title];
    });
    expect(documented).toEqual(ACCEPTANCE_STEPS.map((step) => step.title));
  });
});
