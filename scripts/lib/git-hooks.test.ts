import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gitHooksAdvice, HUSKY_HOOKS_PATH, readGitState } from './git-hooks';

describe('gitHooksAdvice', () => {
  it('is silent when the Husky hooks are installed', () => {
    expect(gitHooksAdvice({ isRepository: true, hooksPath: HUSKY_HOOKS_PATH })).toBeNull();
    expect(gitHooksAdvice({ isRepository: true, hooksPath: `${HUSKY_HOOKS_PATH}\n` })).toBeNull();
  });

  it('asks for bun run prepare when the hooks path is unset or foreign', () => {
    for (const hooksPath of ['', '.git/hooks']) {
      expect(gitHooksAdvice({ isRepository: true, hooksPath })).toContain('bun run prepare');
    }
  });

  it('asks for git init first outside a repository', () => {
    const advice = gitHooksAdvice({ isRepository: false, hooksPath: '' });
    expect(advice).toContain('git init -b main');
    expect(advice).toContain('bun run prepare');
  });
});

describe('readGitState', () => {
  it('reads this repository (hooks installed by bun install → prepare)', () => {
    expect(readGitState(resolve(import.meta.dir, '../..')).isRepository).toBe(true);
  });

  it('reports a folder outside any repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-hooks-'));
    try {
      expect(readGitState(dir)).toEqual({ isRepository: false, hooksPath: '' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
