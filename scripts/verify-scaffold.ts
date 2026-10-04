/**
 * Verifies the scaffold-module skill template against the real quality gates.
 *
 * Usage: bun run verify:scaffold
 *
 * Materializes every code block of `.agents/skills/scaffold-module/SKILL.md` as a probe module
 * (`scaffold-probes`), registers it exactly as the template instructs, then runs prettier, tsc,
 * eslint, ls-lint, dependency-cruiser and knip, plus a live request through `createApp()`.
 * Everything it creates or edits is restored afterwards — also on failure or Ctrl+C.
 *
 * Why: the template is documentation, so no other gate compiles it. It drifted from the code
 * three times before this check existed (see the adoption plan log).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SKILL_PATH = '.agents/skills/scaffold-module/SKILL.md';
const APP_PATH = 'src/app.ts';
const SCHEMA_BARREL = 'src/database/schema/domain/index.ts';
const MODULE_DIR = 'src/modules/scaffold-probes';
const SCHEMA_FILE = 'src/database/schema/domain/scaffold-probes.schema.ts';

/** Kebab-case name with a hyphen on purpose: exercises naming rules for multi-word modules. */
const PLACEHOLDERS: [RegExp, string][] = [
  [/<snake_plural>/g, 'scaffold_probes'],
  [/<UPPER_SINGULAR>/g, 'SCAFFOLD_PROBE'],
  [/<PascalPlural>/g, 'ScaffoldProbes'],
  [/<camelPlural>/g, 'scaffoldProbes'],
  [/<PascalSingular>/g, 'ScaffoldProbe'],
  [/<camelSingular>/g, 'scaffoldProbe'],
  [/<name>/g, 'scaffold-probes'],
];

const fill = (text: string): string =>
  PLACEHOLDERS.reduce((result, [pattern, value]) => result.replace(pattern, value), text);

const originals = new Map<string, string>();
let cleanedUp = false;

const cleanup = (): void => {
  if (cleanedUp) return;
  cleanedUp = true;
  rmSync(MODULE_DIR, { recursive: true, force: true });
  rmSync(SCHEMA_FILE, { force: true });
  for (const [path, content] of originals) writeFileSync(path, content);
};

const editFile = (path: string, edit: (content: string) => string): void => {
  const content = readFileSync(path, 'utf-8');
  if (!originals.has(path)) originals.set(path, content);
  const next = edit(content);
  if (next === content) throw new Error(`template registration did not change ${path}`);
  writeFileSync(path, next);
};

const run = (label: string, command: string[]): boolean => {
  const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
  const ok = result.exitCode === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(result.stdout.toString().trim());
    console.log(result.stderr.toString().trim());
  }
  return ok;
};

const generate = (): string[] => {
  const skill = readFileSync(SKILL_PATH, 'utf-8');
  const stepPattern = /### Step \d+: [^\n]*\(`(src\/[^`]+)`\)[\s\S]*?```typescript\n([\s\S]*?)```/g;
  const generated: string[] = [];

  for (const match of skill.matchAll(stepPattern)) {
    const path = fill(match[1]);
    if (path === APP_PATH) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, fill(match[2]));
    generated.push(path);
  }
  if (generated.length === 0) throw new Error(`no templates found in ${SKILL_PATH}`);

  editFile(SCHEMA_BARREL, (content) => `${content}export * from './scaffold-probes.schema';\n`);
  editFile(APP_PATH, (content) =>
    content
      .replace(
        "import { userRoutes } from './modules/users/users.routes';",
        "import { userRoutes } from './modules/users/users.routes';\nimport { scaffoldProbesRouter } from './modules/scaffold-probes/scaffold-probes.routes';",
      )
      .replace(
        "  v1.route('/users', userRoutes);",
        "  v1.route('/users', userRoutes);\n  v1.route('/scaffold-probes', scaffoldProbesRouter);",
      ),
  );
  return generated;
};

const LIVE_CHECK = `
const { createApp } = await import('./src/app.ts');
const { appConfig } = await import('./src/config/index.ts');
const app = createApp();
const base = appConfig.API_BASE_PATH;
const res = await app.request(base + '/v1/scaffold-probes/not-a-uuid', { headers: { 'Accept-Language': 'en' } });
const body = await res.json();
if (res.status !== 400 || body.error?.code !== 'ERR_INVALID_INPUT') {
  console.error('unexpected response', res.status, JSON.stringify(body));
  process.exit(1);
}
const doc = await (await app.request(base + '/docs/openapi.json')).json();
// Present with a summary and a 2xx response = described by describeEndpoint(), not only by validate().
const documented = [['/v1/scaffold-probes', 'post'], ['/v1/scaffold-probes', 'get'], ['/v1/scaffold-probes/{id}', 'get']]
  .every(([path, method]) => {
    const op = doc.paths?.[base + path]?.[method];
    return op?.summary && Object.keys(op.responses ?? {}).some((status) => status.startsWith('2'));
  });
if (!documented) {
  console.error('scaffolded routes not described with describeEndpoint() in the OpenAPI document:', Object.keys(doc.paths ?? {}).join(', '));
  process.exit(1);
}`;

const main = (): void => {
  if (existsSync(MODULE_DIR) || existsSync(SCHEMA_FILE)) {
    console.error(`Refusing to run: ${MODULE_DIR} or ${SCHEMA_FILE} already exists.`);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  let ok = false;
  try {
    const generated = generate();
    console.log(`Generated ${String(generated.length)} files from ${SKILL_PATH}`);

    // The templates are formatted for a short name; the skill instructs to format first.
    ok =
      run('prettier --write (as instructed by the skill)', [
        'bunx',
        'prettier',
        '--write',
        ...generated,
      ]) &&
      run('tsc --noEmit', ['bunx', 'tsc', '--noEmit']) &&
      run('eslint', ['bunx', 'eslint', '--max-warnings', '0', ...generated, APP_PATH]) &&
      run('ls-lint', ['bunx', 'ls-lint']) &&
      run('dependency-cruiser', [
        'bunx',
        'depcruise',
        'src',
        '--config',
        '.dependency-cruiser.cjs',
      ]) &&
      run('knip', ['bunx', 'knip']) &&
      run('live request through createApp()', ['bun', '-e', LIVE_CHECK]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    ok = false;
  } finally {
    cleanup();
  }

  console.log(
    ok
      ? 'SUCCESS: scaffold-module template passes every gate.'
      : 'FAILURE: the scaffold-module template is out of sync with the codebase.',
  );
  process.exit(ok ? 0 : 1);
};

main();
