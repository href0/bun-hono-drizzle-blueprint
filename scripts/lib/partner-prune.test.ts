import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  PARTNER_ONLY,
  PartnerMarkerError,
  planPartner,
  pruneRegions,
  withoutPartnerScripts,
} from './partner-prune';

const TS = [
  'const a = 1;',
  '  // partner:start',
  '  const partner = 2;',
  '  // partner:end',
  'const b = 3;',
].join('\n');

describe('pruneRegions', () => {
  it('keeps the region without its markers, or drops it whole', () => {
    expect(pruneRegions(TS, 'src/a.ts', true)).toEqual({
      content: 'const a = 1;\n  const partner = 2;\nconst b = 3;',
      regions: 1,
    });
    expect(pruneRegions(TS, 'src/a.ts', false)).toEqual({
      content: 'const a = 1;\nconst b = 3;',
      regions: 1,
    });
  });

  it('uses the comment style of the file and keeps CRLF line endings', () => {
    const env = 'A=1\r\n# partner:start\r\nPARTNER_X=\r\n# partner:end\r\nB=2';
    expect(pruneRegions(env, '.env.example', false).content).toBe('A=1\r\nB=2');
    const md = 'Intro\n<!-- partner:start -->\nPartner guide\n<!-- partner:end -->\nEnd';
    expect(pruneRegions(md, 'docs/a.md', false).content).toBe('Intro\nEnd');
    // Another style's marker is plain text; an unknown file type is never touched.
    expect(pruneRegions(TS, 'docs/a.md', false).regions).toBe(0);
    expect(pruneRegions(TS, 'data.json', false).content).toBe(TS);
  });

  it('Markdown: a line ending with the line marker is kept without it, or dropped', () => {
    const md =
      '```text\n├── a/\n├── partner/   # gateway <!-- partner -->\n```\nSee `<!-- partner -->`.';
    expect(pruneRegions(md, 'docs/a.md', true)).toEqual({
      content: '```text\n├── a/\n├── partner/   # gateway\n```\nSee `<!-- partner -->`.',
      regions: 1,
    });
    expect(pruneRegions(md, 'docs/a.md', false).content).toBe(
      '```text\n├── a/\n```\nSee `<!-- partner -->`.',
    );
  });

  it('Markdown: a hidden no-partner line shows only without the gateway', () => {
    const md =
      '| R1 | Partner rule | [test:x] | <!-- partner -->\n<!-- no-partner: | R1 | Removed | [review-only] | -->\n| R2 | Next |';
    expect(pruneRegions(md, 'docs/a.md', true).content).toBe(
      '| R1 | Partner rule | [test:x] |\n| R2 | Next |',
    );
    expect(pruneRegions(md, 'docs/a.md', false)).toEqual({
      content: '| R1 | Removed | [review-only] |\n| R2 | Next |',
      regions: 2,
    });
  });

  it('a marker inside a line is not a marker', () => {
    const text = "const doc = '// partner:start';\nconst x = 1;";
    expect(pruneRegions(text, 'src/a.ts', false)).toEqual({ content: text, regions: 0 });
  });

  it('refuses an unclosed, unopened or nested region', () => {
    expect(() => pruneRegions('// partner:start\nx', 'src/a.ts', true)).toThrow(
      'src/a.ts:1: "// partner:start" is never closed',
    );
    expect(() => pruneRegions('x\n// partner:end', 'src/a.ts', true)).toThrow(
      'src/a.ts:2: "// partner:end" without',
    );
    expect(() =>
      pruneRegions('// partner:start\n// partner:start\n// partner:end', 'src/a.ts', true),
    ).toThrow(PartnerMarkerError);
  });
});

describe('withoutPartnerScripts', () => {
  it('drops the partner scripts only, formatted like package.json', () => {
    const before = JSON.stringify(
      { name: 'x', scripts: { dev: 'bun dev', 'partner:sign': 'bun s', 'scaffold:partner': 'b' } },
      null,
      2,
    );
    expect(withoutPartnerScripts(before)).toBe(
      `${JSON.stringify({ name: 'x', scripts: { dev: 'bun dev' } }, null, 2)}\n`,
    );
  });
});

describe('planPartner (on a temporary tree)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const tree = (files: Record<string, string>, withPartnerOnly = true): string => {
    const root = mkdtempSync(join(tmpdir(), 'partner-prune-'));
    roots.push(root);
    const all: Record<string, string> = {
      'package.json': JSON.stringify({ name: 'x', scripts: { 'partner:sign': 'bun s' } }),
      ...files,
    };
    if (withPartnerOnly) {
      for (const path of PARTNER_ONLY) all[`${path}${path.includes('.') ? '' : '/keep.ts'}`] = '';
    }
    for (const [path, content] of Object.entries(all)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  };

  it('with the gateway: only the markers go; without: regions, PARTNER_ONLY and scripts', () => {
    const root = tree({ 'src/app.ts': TS, 'docs/guide.md': 'Guide' });
    const kept = planPartner(root, true);
    expect(kept.problems).toEqual([]);
    expect(kept.remove).toEqual([]);
    expect([...kept.edits.keys()]).toEqual(['src/app.ts']);

    const pruned = planPartner(root, false);
    expect(pruned.problems).toEqual([]);
    expect(pruned.remove).toEqual([...PARTNER_ONLY]);
    expect(pruned.edits.get('src/app.ts')).toBe('const a = 1;\nconst b = 3;');
    expect(pruned.edits.get('package.json')).not.toContain('partner:sign');
  });

  it('fails on a partner line outside a region, a bad marker, a missing PARTNER_ONLY path', () => {
    const root = tree(
      {
        'src/app.ts': TS,
        'test/a.test.ts': "it('partner ping', () => {});",
        'src/b.ts': '// partner:start',
        'docs/guide.md': 'A partner guide is allowed outside src/ and test/',
      },
      false,
    );
    const problems = planPartner(root, true).problems;
    expect(problems).toContain(
      'src/b.ts:1: "// partner:start" is never closed by "// partner:end"',
    );
    expect(problems).toContain(
      "test/a.test.ts:1: partner outside a marked region: it('partner ping', () => {});",
    );
    expect(problems).toContain(`${PARTNER_ONLY[0] ?? ''}: not found (PARTNER_ONLY)`);
    expect(problems.some((problem) => problem.startsWith('docs/guide.md'))).toBe(false);
  });

  it('a boilerplate without markers is drift; an initialized project is left alone', () => {
    expect(planPartner(tree({ 'src/app.ts': 'const a = 1;' }), true).problems).toEqual([
      'no partner markers found in the boilerplate',
    ]);

    const project = tree({
      'package.json': JSON.stringify({ name: 'x', boilerplate: { partner: true } }),
      'src/app.ts': "const partner = 'kept by the project';",
    });
    expect(planPartner(project, true)).toEqual({
      edits: new Map(),
      remove: [],
      regions: 0,
      problems: [],
    });
    expect(planPartner(project, false).problems).toEqual([
      'the partner markers were removed by an earlier setup: remove the gateway by hand (docs/standards/project-setup.md)',
    ]);
  });
});
