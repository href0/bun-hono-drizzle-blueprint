import { describe, expect, it } from 'bun:test';
import { projectChangelog } from './project-changelog';

describe('projectChangelog', () => {
  const changelog = projectChangelog('1.2.3');

  it('starts the project with an empty Unreleased section', () => {
    expect(changelog.startsWith('# Changelog\n')).toBe(true);
    expect(changelog.endsWith('## [Unreleased]\n')).toBe(true);
  });

  it('names the boilerplate release it started from, without its entries', () => {
    expect(changelog).toContain('Created from the boilerplate v1.2.3');
    expect(changelog).toContain('git show vX.Y.Z:CHANGELOG.md');
    expect(changelog).not.toMatch(/^## \[\d/m);
  });
});
