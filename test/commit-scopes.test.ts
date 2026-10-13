import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import config, { allowedScopes, derivedScopes, PLATFORM_SCOPES } from '../commitlint.config';

/**
 * Commit scopes (docs/standards/git-workflow.md §2): the fixed scopes are listed once in
 * `commitlint.config.ts` and once in the standard — kept equal here — and every folder of the
 * source tree is a scope, read when committing.
 */

const ROOT = resolve(import.meta.dir, '..');

/** Backticked scopes of the scope table's fixed rows (patterns such as `<module>` excluded). */
const documentedScopes = async (): Promise<string[]> => {
  const text = await Bun.file(resolve(ROOT, 'docs/standards/git-workflow.md')).text();
  const table = text.slice(text.indexOf('**Scopes**'), text.indexOf('Examples:'));
  return table
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| From the source tree'))
    .flatMap((line) => (line.split('|').at(2) ?? '').match(/`[^`]+`/g) ?? [])
    .map((token) => token.slice(1, -1))
    .filter((token) => /^[a-z][a-z0-9-]*(\/[a-z0-9-]+)?$/.test(token));
};

describe('commit scopes', () => {
  it('the standard lists exactly the fixed scopes of commitlint.config.ts', async () => {
    expect((await documentedScopes()).sort()).toEqual([...PLATFORM_SCOPES].sort());
  });

  it('derives modules (dependents included), core areas, database folders, vendors and utils', () => {
    expect(derivedScopes(ROOT)).toEqual(
      expect.arrayContaining([
        'users',
        'health',
        'core/cache',
        'core/security',
        'database/schema',
        'integrations/jsonplaceholder',
        'utils/datetime',
      ]),
    );
    expect(derivedScopes(resolve(ROOT, 'no-such-folder'))).toEqual([]);
  });

  it('requires one scope from the allowed list', () => {
    expect(config.rules['scope-empty']).toEqual([2, 'never']);
    expect(config.rules['scope-enum']).toEqual([2, 'always', allowedScopes(ROOT)]);
    expect(allowedScopes(ROOT)).not.toContain('modules/health');
    expect(new Set(allowedScopes(ROOT)).size).toBe(allowedScopes(ROOT).length);
  });
});
