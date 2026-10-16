import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * CI re-runs every local gate (R77): each script that `validate:full` (pre-push) runs is its own
 * step of the CI job `verify` — one step per gate, so a failure names its gate in the Actions tab.
 * Listing the gates twice (package.json and ci.yml) is the price of that; this test keeps them equal.
 */
const ROOT = resolve(import.meta.dir, '..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf-8');
const scripts = new Map(
  Object.entries((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts),
);

/**
 * Gates CI checks differently, with the replacement step it must have instead: `lint:branch` reads
 * the local branch, but a pull request is checked out as a detached merge commit (`HEAD`).
 */
const REPLACED_IN_CI = new Map([
  ['lint:branch', 'bunx validate-branch-name -t "${{ github.head_ref }}"'],
]);

/** The gates a script runs: `bun run <name>` steps, aggregate scripts expanded. */
const gatesOf = (name: string): string[] => {
  const steps = [...(scripts.get(name) ?? '').matchAll(/bun run ([\w:-]+)/g)].map((m) => m[1]);
  if (steps.length === 0) return [name];
  return steps.flatMap(gatesOf);
};

/** The `run:` lines of the CI job `verify` (up to the next job). */
const verifyJobRuns = (): string[] => {
  const ci = read('.github/workflows/ci.yml');
  const job = ci.slice(ci.indexOf('\n  verify:'), ci.indexOf('\n  integration:'));
  return [...job.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1].trim());
};

describe('CI runs every local gate', () => {
  it('each gate of validate:full is its own step of the verify job', () => {
    const gates = gatesOf('validate:full');
    const runs = verifyJobRuns();
    expect(gates.length).toBeGreaterThanOrEqual(9);
    expect(
      gates.filter((gate) => !REPLACED_IN_CI.has(gate) && !runs.includes(`bun run ${gate}`)),
    ).toEqual([]);
    for (const [gate, replacement] of REPLACED_IN_CI) {
      expect(gates).toContain(gate);
      expect(runs).toContain(replacement);
    }
  });
});
