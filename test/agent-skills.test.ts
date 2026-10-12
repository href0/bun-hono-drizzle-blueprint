import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

/**
 * `.agents/skills/` is the source of truth; `.claude/skills/<name>/SKILL.md` only wires a skill into
 * Claude Code (CLAUDE.md). The two drifted once (review of phase 4): wrappers were updated, the
 * source frontmatter was not. Every skill has exactly one wrapper with the same trigger text.
 */
const SOURCE_DIR = '.agents/skills';
const WRAPPER_DIR = '.claude/skills';

const skillNames = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const frontmatter = (path: string): Map<string, string> => {
  const block = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
  const fields = new Map<string, string>();
  for (const line of block?.[1]?.split('\n') ?? []) {
    const separator = line.indexOf(':');
    if (separator > 0)
      fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return fields;
};

describe('agent skills (.agents ↔ .claude wrappers)', () => {
  const sources = skillNames(SOURCE_DIR);

  it('should wrap every source skill, and wrap nothing else', () => {
    expect(skillNames(WRAPPER_DIR)).toEqual(sources);
  });

  it.each(sources)('%s: same name and description, wrapper points to the source', (skill) => {
    const sourcePath = `${SOURCE_DIR}/${skill}/SKILL.md`;
    const wrapperPath = `${WRAPPER_DIR}/${skill}/SKILL.md`;
    expect(existsSync(wrapperPath)).toBe(true);

    const source = frontmatter(sourcePath);
    const wrapper = frontmatter(wrapperPath);
    expect(source.get('name')).toBe(skill);
    expect(wrapper.get('name')).toBe(skill);
    expect(wrapper.get('description')).toBeTruthy();
    expect(source.get('description')).toBe(wrapper.get('description'));
    expect(readFileSync(wrapperPath, 'utf8')).toContain(sourcePath);
  });
});
