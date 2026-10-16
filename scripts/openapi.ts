/**
 * API contract snapshot (plan D34): docs/api/openapi.json is the reviewed contract of the HTTP API.
 *
 * Usage:
 *   bun run openapi:check                     # exit 1 on ANY difference (validate, pre-push, CI)
 *   bun run openapi:update [--allow-breaking] # write the snapshot after reviewing the changes
 *
 * `check` compares the document of `createApp()` (fixed configuration, never the local env file)
 * with the snapshot semantically and labels each change BREAKING / safe / docs. `update` is run by
 * a developer only, consciously: never by a hook, CI or `bun run scaffold` (`bun run setup` writes
 * the baseline of a new project). It refuses BREAKING changes unless `--allow-breaking` is given —
 * a breaking change under /v1 usually deserves a /v2 instead (R19).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compare, type ClassifiedChange } from './lib/api-contract/compare';
import {
  buildContractDocument,
  serializeDocument,
  SNAPSHOT_PATH,
} from './lib/api-contract/document';
import { flatten } from './lib/api-contract/flatten';
import { countBySeverity, formatReport } from './lib/api-contract/report';

const ROOT = resolve(import.meta.dir, '..');
const snapshotFile = resolve(ROOT, SNAPSHOT_PATH);

const fail = (message: string): never => {
  console.error(`[openapi] ${message}`);
  process.exit(1);
};

const changesAgainstSnapshot = (current: unknown): ClassifiedChange[] => {
  const snapshot: unknown = JSON.parse(readFileSync(snapshotFile, 'utf-8'));
  return compare(flatten(snapshot), flatten(current));
};

const check = (current: unknown, serialized: string): void => {
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
  console.log(`[openapi] The API contract matches ${SNAPSHOT_PATH}`);
};

const update = (current: unknown, serialized: string, allowBreaking: boolean): void => {
  if (existsSync(snapshotFile)) {
    const changes = changesAgainstSnapshot(current);
    if (changes.length > 0) console.log(formatReport(changes));
    if (countBySeverity(changes).BREAKING > 0 && !allowBreaking) {
      fail(
        '\nRefusing to write BREAKING changes (nothing written). Prefer a /v2 route (R19); if old ' +
          'clients are updated together, run: bun run openapi:update --allow-breaking',
      );
    }
    if (readFileSync(snapshotFile, 'utf-8') === serialized) {
      console.log(`[openapi] ${SNAPSHOT_PATH} is already up to date`);
      return;
    }
  }
  mkdirSync(dirname(snapshotFile), { recursive: true });
  writeFileSync(snapshotFile, serialized, 'utf-8');
  console.log(`[openapi] Wrote ${SNAPSHOT_PATH} — commit it with the change it documents`);
};

const main = async (): Promise<void> => {
  const [command, ...flags] = process.argv.slice(2);
  if (command !== 'check' && command !== 'update') {
    fail('usage: bun scripts/openapi.ts check | update [--allow-breaking]');
  }
  const current = await buildContractDocument(ROOT);
  const serialized = serializeDocument(current);
  if (command === 'check') check(current, serialized);
  else update(current, serialized, flags.includes('--allow-breaking'));
};

try {
  await main();
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
