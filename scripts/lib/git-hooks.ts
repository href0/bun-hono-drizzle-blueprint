/**
 * Whether the Husky git hooks of this repository are active (pre-commit, commit-msg, pre-push).
 *
 * Husky installs them by setting `core.hooksPath` in `.git/config` when `bun run prepare` runs —
 * a setting that is lost with a fresh `git init`, after which commits skip every local gate
 * without a word. `bun run setup` prints the advice below so that never goes unnoticed.
 */
export const HUSKY_HOOKS_PATH = '.husky/_';

export interface GitState {
  /** Inside a git work tree. */
  isRepository: boolean;
  /** `git config --get core.hooksPath`, empty when unset. */
  hooksPath: string;
}

/** What to do so the hooks run, or `null` when they already do. */
export const gitHooksAdvice = ({ isRepository, hooksPath }: GitState): string | null => {
  if (!isRepository) {
    return 'No git repository: run `git init -b main`, then `bun run prepare` to install the git hooks.';
  }
  if (hooksPath.trim() !== HUSKY_HOOKS_PATH) {
    return 'Git hooks are not installed (commits would skip lint, typecheck and commitlint): run `bun run prepare`.';
  }
  return null;
};

/** Reads the git state of `cwd` (no git on PATH counts as "no repository"). */
export const readGitState = (cwd: string): GitState => {
  const git = (...args: string[]): string => {
    try {
      const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
      return result.exitCode === 0 ? result.stdout.toString().trim() : '';
    } catch {
      return '';
    }
  };
  const isRepository = git('rev-parse', '--is-inside-work-tree') === 'true';
  return {
    isRepository,
    hooksPath: isRepository ? git('config', '--get', 'core.hooksPath') : '',
  };
};
