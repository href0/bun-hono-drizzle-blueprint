import { describe, expect, it } from 'bun:test';
import { diffIds } from './rbac-replace.util';

describe('diffIds (D72)', () => {
  it('nothing now, nothing wanted: no change', () => {
    expect(diffIds([], [])).toEqual({ added: [], removed: [], unchanged: [] });
  });

  it('the same set, in any order: everything unchanged', () => {
    expect(diffIds(['a', 'b'], ['b', 'a'])).toEqual({
      added: [],
      removed: [],
      unchanged: ['b', 'a'],
    });
  });

  it('only additions, only removals, and both at once', () => {
    expect(diffIds(['a'], ['a', 'b'])).toEqual({ added: ['b'], removed: [], unchanged: ['a'] });
    expect(diffIds(['a', 'b'], [])).toEqual({ added: [], removed: ['a', 'b'], unchanged: [] });
    expect(diffIds(['a', 'b', 'c'], ['c', 'd', 'a'])).toEqual({
      added: ['d'],
      removed: ['b'],
      unchanged: ['c', 'a'],
    });
  });
});
