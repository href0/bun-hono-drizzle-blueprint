import { describe, expect, it } from 'bun:test';
import type { ClassifiedChange, Severity } from './api-contract/compare';
import { confirmContractUpdate, NOTE_LINES, purgeAfterConfirmation } from './confirmations';
import { ENTER, scriptedPrompter } from './scripted-prompter';

const change = (severity: Severity, location: string): ClassifiedChange => ({
  severity,
  change: {
    kind: severity === 'BREAKING' ? 'removed' : 'added',
    fact: { operation: 'GET /api/v1/users', side: 'response', location, attributes: {} },
  },
});

const SAFE = change('safe', 'response 200.data.nickname');
const BREAKING = change('BREAKING', 'response 200.data.email');

describe('confirmContractUpdate (openapi:update in a terminal)', () => {
  it('shows the changes, then asks whether to write (Enter = Yes)', async () => {
    const session = scriptedPrompter(ENTER);
    expect(
      await confirmContractUpdate(session.prompter, {
        changes: [SAFE],
        drift: [],
        allowBreaking: false,
      }),
    ).toBe(true);
    expect(session.shown.at(0)).toStartWith(
      'note: Changes against the snapshot: 1 change(s): 0 BREAKING, 1 safe',
    );
    expect(session.asked).toEqual(['Write the snapshot and docs/api/*.md?']);
  });

  it('BREAKING needs its own Yes, No by default: then nothing is written', async () => {
    const session = scriptedPrompter(ENTER);
    expect(
      await confirmContractUpdate(session.prompter, {
        changes: [SAFE, BREAKING],
        drift: [],
        allowBreaking: false,
      }),
    ).toBe(false);
    expect(session.asked.at(0)).toStartWith('Write 1 BREAKING change(s)?');
    expect(session.asked.at(0)).toContain('/v2');
    expect(session.asked).toHaveLength(1);
  });

  it('BREAKING accepted, then the write question; --allow-breaking skips the BREAKING question', async () => {
    const accepted = scriptedPrompter(true, true);
    expect(
      await confirmContractUpdate(accepted.prompter, {
        changes: [BREAKING],
        drift: [],
        allowBreaking: false,
      }),
    ).toBe(true);
    expect(accepted.asked).toHaveLength(2);
    const flagged = scriptedPrompter(false);
    expect(
      await confirmContractUpdate(flagged.prompter, {
        changes: [BREAKING],
        drift: [],
        allowBreaking: true,
      }),
    ).toBe(false);
    expect(flagged.asked).toEqual(['Write the snapshot and docs/api/*.md?']);
  });

  it('only documents to regenerate: listed; a long note is cut with where to see the rest', async () => {
    const drift = Array.from(
      { length: NOTE_LINES + 5 },
      (_, i) => `docs/api/module-${String(i)}.md`,
    );
    const session = scriptedPrompter(true);
    await confirmContractUpdate(session.prompter, { changes: [], drift, allowBreaking: false });
    const note = session.shown.at(0) ?? '';
    expect(note).toContain('No change to the API contract');
    expect(note).toContain('Contract documents to regenerate:');
    expect(note).toContain('more line(s): bun run openapi:check lists all');
    expect(note.split('\n')).toHaveLength(NOTE_LINES + 1);
  });
});

describe('purgeAfterConfirmation (auth:purge-tokens in a terminal)', () => {
  const store = (found: number) => {
    const calls: string[] = [];
    return {
      calls,
      store: {
        count: (days: number) => {
          calls.push(`count ${String(days)}`);
          return Promise.resolve(found);
        },
        purge: (days: number) => {
          calls.push(`purge ${String(days)}`);
          return Promise.resolve(found);
        },
      },
    };
  };

  it('counts, asks (default No), then deletes under a spinner', async () => {
    const fake = store(3);
    const session = scriptedPrompter(true);
    expect(await purgeAfterConfirmation(session.prompter, 7, fake.store)).toBe(3);
    expect(session.asked).toEqual(['Delete 3 refresh token(s) expired more than 7 day(s) ago?']);
    expect(session.shown).toEqual([
      'spinner: Deleting 3 refresh token(s) expired more than 7 day(s) ago',
      'done: Deleted 3 refresh token(s) expired more than 7 day(s) ago',
    ]);
    expect(fake.calls).toEqual(['count 7', 'purge 7']);
  });

  it('No (Enter): nothing deleted', async () => {
    const fake = store(3);
    const session = scriptedPrompter(ENTER);
    expect(await purgeAfterConfirmation(session.prompter, 7, fake.store)).toBeUndefined();
    expect(session.shown).toEqual(['outro: Nothing was deleted']);
    expect(fake.calls).toEqual(['count 7']);
  });

  it('nothing to delete: no question', async () => {
    const fake = store(0);
    const session = scriptedPrompter();
    expect(await purgeAfterConfirmation(session.prompter, 30, fake.store)).toBe(0);
    expect(session.asked).toEqual([]);
    expect(session.shown).toEqual([
      'outro: Nothing to delete: no refresh token expired more than 30 day(s) ago',
    ]);
  });
});
