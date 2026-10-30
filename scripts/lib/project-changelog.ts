/**
 * The `CHANGELOG.md` a new project starts with. The boilerplate's own entries describe the
 * boilerplate's releases, not the project's: kept, they would read as the project's versions once
 * the skill update-version adds the first entry on top. The project keeps a pointer to them instead —
 * the release it started from (`package.json` → `boilerplate.version`) and where to read the rest.
 */
export const projectChangelog = (boilerplateVersion: string): string =>
  [
    '# Changelog',
    '',
    'All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).',
    '',
    `Created from the boilerplate v${boilerplateVersion} (\`package.json\` → \`boilerplate\`). What each boilerplate release changes: \`git show vX.Y.Z:CHANGELOG.md\` on the remote \`upstream\` ([git-workflow.md](docs/standards/git-workflow.md) §1.2).`,
    '',
    '## [Unreleased]',
    '',
  ].join('\n');
