/**
 * The terminal questions of the two commands that change data (plan D40, step 7.4j): each shows
 * the effect first, then asks. Without a terminal neither asks — `openapi:update` refuses BREAKING
 * without `--allow-breaking`, `auth:purge-tokens` deletes (cron, CI job) — so these run only when
 * stdin and stdout are a terminal.
 */
import type { ClassifiedChange } from './api-contract/compare';
import { countBySeverity, formatReport } from './api-contract/report';
import type { Prompter } from './prompter';

/** Lines of a note before it is cut: the rest is one `bun run openapi:check` away. */
export const NOTE_LINES = 30;

const clipped = (lines: readonly string[], more: (hidden: number) => string): string[] =>
  lines.length <= NOTE_LINES
    ? [...lines]
    : [...lines.slice(0, NOTE_LINES), more(lines.length - NOTE_LINES)];

export interface ContractUpdate {
  changes: readonly ClassifiedChange[];
  /** Contract documents that differ from what the code generates. */
  drift: readonly string[];
  allowBreaking: boolean;
  /** `missing`: no snapshot yet; `stale`: not byte for byte what the generator writes; `current`. */
  snapshot: 'missing' | 'stale' | 'current';
}

/** The first lines of the note: what happens to the snapshot itself. */
const snapshotLines = (
  changes: readonly ClassifiedChange[],
  snapshot: ContractUpdate['snapshot'],
): string[] => {
  if (snapshot === 'missing') return ['No snapshot yet: docs/api/openapi.json is created'];
  if (changes.length > 0) return formatReport(changes).split('\n');
  return snapshot === 'stale'
    ? ['No change to the API contract; the snapshot is rewritten in its generated form']
    : ['No change to the API contract'];
};

/**
 * `bun run openapi:update` in a terminal: the changes in a note, a separate Yes for BREAKING (unless
 * `--allow-breaking` was given), then whether to write. True = write.
 */
export const confirmContractUpdate = async (
  prompter: Prompter,
  { changes, drift, allowBreaking, snapshot }: ContractUpdate,
): Promise<boolean> => {
  const report = snapshotLines(changes, snapshot);
  const documents =
    drift.length === 0
      ? []
      : ['', 'Contract documents to regenerate:', ...drift.map((path) => `  ${path}`)];
  prompter.note(
    clipped(
      [...report, ...documents],
      (hidden) => `… ${String(hidden)} more line(s): bun run openapi:check lists all`,
    ).join('\n'),
    'Changes against the snapshot',
  );
  const breaking = countBySeverity(changes).BREAKING;
  if (breaking > 0 && !allowBreaking) {
    const accepted = await prompter.confirm(
      `Write ${String(breaking)} BREAKING change(s)? Existing clients break — under /v1 a /v2 route is usually better (R19)`,
      false,
    );
    if (!accepted) return false;
  }
  return prompter.confirm('Write the snapshot and docs/api/*.md?', true);
};

export interface RefreshTokenStore {
  count: (days: number) => Promise<number>;
  purge: (days: number) => Promise<number>;
}

const tokens = (count: number, days: number): string =>
  `${String(count)} refresh token(s) expired more than ${String(days)} day(s) ago`;

/**
 * `bun run auth:purge-tokens` in a terminal: the count first, a Yes (default No), then the delete
 * under a spinner. Returns how many were deleted; undefined = the person said No.
 */
export const purgeAfterConfirmation = async (
  prompter: Prompter,
  days: number,
  store: RefreshTokenStore,
): Promise<number | undefined> => {
  const found = await store.count(days);
  if (found === 0) {
    prompter.outro(
      `Nothing to delete: no refresh token expired more than ${String(days)} day(s) ago`,
    );
    return 0;
  }
  if (!(await prompter.confirm(`Delete ${tokens(found, days)}?`, false))) {
    prompter.outro('Nothing was deleted');
    return undefined;
  }
  const line = prompter.spinner();
  line.start(`Deleting ${tokens(found, days)}`);
  const deleted = await store.purge(days);
  line.stop('Deleted');
  prompter.outro(`Deleted ${tokens(deleted, days)}`);
  return deleted;
};
