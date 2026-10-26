/**
 * API contract snapshot (plan D34, D35): docs/api/openapi.json is the reviewed contract of the HTTP
 * API, and docs/api/*.md the same contract rendered for integrators (Indonesian).
 *
 * Usage:
 *   bun run openapi:check                     # exit 1 on ANY difference (validate, pre-push, CI)
 *   bun run openapi:update [--allow-breaking] # write the snapshot after reviewing the changes
 *
 * `check` compares the document of `createApp()` (fixed configuration, never the local env file)
 * with the snapshot semantically and labels each change BREAKING / safe / docs, then compares the
 * Markdown byte for byte. `update` is run by a developer only, consciously: never by a hook, CI or
 * `bun run scaffold` (`bun run setup` writes the baseline of a new project). It refuses BREAKING
 * changes unless `--allow-breaking` is given — a breaking change under /v1 usually deserves a /v2
 * instead (R19) — and removes Markdown files of modules that no longer exist.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compare, type ClassifiedChange } from './lib/api-contract/compare';
import { buildContract, serializeDocument, SNAPSHOT_PATH } from './lib/api-contract/document';
import { flatten } from './lib/api-contract/flatten';
import { renderContractMarkdown } from './lib/api-contract/markdown';
import { countBySeverity, formatReport } from './lib/api-contract/report';
import { exitWithUsage, readCli } from './lib/cli-args';
import { usageOf } from './lib/commands';

const ROOT = resolve(import.meta.dir, '..');
const snapshotFile = resolve(ROOT, SNAPSHOT_PATH);
const DOCS_DIR = dirname(snapshotFile);
const DOCS_PATH = dirname(SNAPSHOT_PATH);

const fail = (message: string): never => {
  console.error(`[openapi] ${message}`);
  process.exit(1);
};

const changesAgainstSnapshot = (current: unknown): ClassifiedChange[] => {
  const snapshot: unknown = JSON.parse(readFileSync(snapshotFile, 'utf-8'));
  return compare(flatten(snapshot), flatten(current));
};

/** Markdown files currently in docs/api/, relative to it. */
const existingMarkdown = (): string[] =>
  existsSync(DOCS_DIR)
    ? readdirSync(DOCS_DIR, { recursive: true, encoding: 'utf8' })
        .map((path) => path.split('\\').join('/'))
        .filter((path) => path.endsWith('.md'))
        .sort()
    : [];

/** Files that differ from what the generator produces now (missing, edited, or stale). */
const markdownDrift = (markdown: ReadonlyMap<string, string>): string[] => [
  ...[...markdown]
    .filter(([path, content]) => {
      const file = resolve(DOCS_DIR, path);
      return !existsSync(file) || readFileSync(file, 'utf-8') !== content;
    })
    .map(([path]) => `${DOCS_PATH}/${path}`),
  ...existingMarkdown()
    .filter((path) => !markdown.has(path))
    .map((path) => `${DOCS_PATH}/${path} (no longer generated)`),
];

const check = (
  current: unknown,
  serialized: string,
  markdown: ReadonlyMap<string, string>,
): void => {
  if (!existsSync(snapshotFile)) fail(`${SNAPSHOT_PATH} is missing: run bun run openapi:update`);
  const changes = changesAgainstSnapshot(current);
  if (changes.length > 0) {
    console.error(`[openapi] The API contract differs from ${SNAPSHOT_PATH}\n`);
    console.error(formatReport(changes));
    const breaking = countBySeverity(changes).BREAKING > 0;
    fail(
      `\nIntended? Review the changes, then run: bun run openapi:update${breaking ? ' --allow-breaking' : ''}` +
        (breaking
          ? '\nBREAKING breaks existing clients: under /v1 consider a /v2 route instead (R19).'
          : ''),
    );
  }
  if (readFileSync(snapshotFile, 'utf-8') !== serialized) {
    fail(
      `${SNAPSHOT_PATH} is not in its generated form (edited by hand?): run bun run openapi:update`,
    );
  }
  const drift = markdownDrift(markdown);
  if (drift.length > 0) {
    fail(
      `The contract documents are not what the code generates (edited by hand, or the generator changed):\n  ${drift.join('\n  ')}\nRun: bun run openapi:update`,
    );
  }
  console.log(`[openapi] The API contract matches ${SNAPSHOT_PATH} and ${DOCS_PATH}/*.md`);
};

/** A removed parent module leaves its (now empty) folder of dependent documents behind. */
const pruneEmptyFolders = (): void => {
  if (!existsSync(DOCS_DIR)) return;
  for (const entry of readdirSync(DOCS_DIR, { withFileTypes: true })) {
    const folder = resolve(DOCS_DIR, entry.name);
    if (entry.isDirectory() && readdirSync(folder).length === 0)
      rmSync(folder, { recursive: true });
  }
};

const update = (
  current: unknown,
  serialized: string,
  markdown: ReadonlyMap<string, string>,
  allowBreaking: boolean,
): void => {
  if (existsSync(snapshotFile)) {
    const changes = changesAgainstSnapshot(current);
    if (changes.length > 0) console.log(formatReport(changes));
    if (countBySeverity(changes).BREAKING > 0 && !allowBreaking) {
      fail(
        '\nRefusing to write BREAKING changes (nothing written). Prefer a /v2 route (R19); if old ' +
          'clients are updated together, run: bun run openapi:update --allow-breaking',
      );
    }
  }
  pruneEmptyFolders();
  const drift = markdownDrift(markdown);
  const snapshotCurrent =
    existsSync(snapshotFile) && readFileSync(snapshotFile, 'utf-8') === serialized;
  if (snapshotCurrent && drift.length === 0) {
    console.log(`[openapi] ${SNAPSHOT_PATH} and ${DOCS_PATH}/*.md are already up to date`);
    return;
  }
  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(snapshotFile, serialized, 'utf-8');
  for (const path of existingMarkdown().filter((file) => !markdown.has(file))) {
    rmSync(resolve(DOCS_DIR, path));
  }
  pruneEmptyFolders();
  for (const [path, content] of markdown) {
    const file = resolve(DOCS_DIR, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf-8');
  }
  console.log(
    `[openapi] Wrote ${SNAPSHOT_PATH} and ${String(markdown.size)} contract documents — commit them with the change they document`,
  );
};

const main = async (): Promise<void> => {
  const usage = usageOf('openapi.ts');
  const cli = readCli(process.argv.slice(2), usage, {
    flags: ['--allow-breaking'],
    positionals: 1,
  });
  const [command] = cli.positionals;
  if (command !== 'check' && command !== 'update') {
    exitWithUsage('the first argument is check or update', usage);
  }
  if (command === 'check' && cli.flags.has('--allow-breaking')) {
    exitWithUsage('--allow-breaking is an option of update', usage);
  }
  const { document, owners } = await buildContract(ROOT);
  const serialized = serializeDocument(document);
  const markdown = renderContractMarkdown(document, owners);
  if (command === 'check') check(document, serialized, markdown);
  else update(document, serialized, markdown, cli.flags.has('--allow-breaking'));
};

try {
  await main();
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
