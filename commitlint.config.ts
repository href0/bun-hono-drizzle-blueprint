import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Scopes that are not a folder of `src/` (docs/standards/git-workflow.md §2 lists them; the table
 * and this list are kept equal by test/commit-scopes.test.ts).
 */
export const PLATFORM_SCOPES = [
  'app',
  'config',
  'core',
  'database',
  'database/migrations',
  'utils',
  'integrations',
  // partner:start
  'partner',
  'partner-auth',
  // partner:end
  'webhooks',
  'conventions',
  'quality-gates',
  'deps',
  'lint',
  'scripts',
  'ci',
  'docker',
  'scaffold',
  'setup',
  'integration',
  'review',
  'standards',
  'architecture',
  'agents',
  'skills',
  'plans',
  'readme',
  'release',
] as const;

const folders = (root: string, dir: string): string[] => {
  const path = resolve(root, dir);
  return existsSync(path)
    ? readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
};

/**
 * Scopes read from the source tree when committing, so a new module or vendor is a valid scope
 * the moment it exists: every module (dependent modules included), `core/<area>`,
 * `database/<folder>`, `integrations/<vendor>` and `utils/<name>` (from `<name>.util.ts`).
 */
export const derivedScopes = (root = import.meta.dirname): string[] => {
  const modules = folders(root, 'src/modules');
  const utils = existsSync(resolve(root, 'src/utils'))
    ? readdirSync(resolve(root, 'src/utils'))
        .filter((file) => /^[a-z0-9-]+\.util\.ts$/.test(file))
        .map((file) => `utils/${file.replace(/\.util\.ts$/, '')}`)
    : [];
  return [
    ...modules,
    ...modules.flatMap((module) => folders(root, `src/modules/${module}`)),
    ...folders(root, 'src/core').map((area) => `core/${area}`),
    ...folders(root, 'src/database').map((folder) => `database/${folder}`),
    ...folders(root, 'src/integrations').map((vendor) => `integrations/${vendor}`),
    ...utils,
  ];
};

export const allowedScopes = (root?: string): string[] =>
  [...new Set([...PLATFORM_SCOPES, ...derivedScopes(root)])].sort();

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'ci', 'perf', 'revert', 'build'],
    ],
    // One scope per commit, from the platform list or the source tree (git-workflow.md §2).
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', allowedScopes()],
    'subject-full-stop': [2, 'never', '.'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always'],
  },
};
