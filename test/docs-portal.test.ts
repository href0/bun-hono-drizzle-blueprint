import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The portal layout (R86, D43): Starlight keeps the content column at 45rem on every screen and lets
 * wide tables scroll sideways. `docs-site/src/styles/custom.css` widens the column with the screen
 * and lets a long path or command break inside a table cell — this test keeps that file wired into
 * the Starlight config, so an upgrade or a config edit cannot silently bring the narrow column back.
 */
const SITE = resolve(import.meta.dir, '../docs-site');
const CUSTOM_CSS = './src/styles/custom.css';
const STARLIGHT_CONTENT_WIDTH_REM = 45;

const config = readFileSync(resolve(SITE, 'astro.config.mjs'), 'utf-8');
const cssPath = resolve(SITE, CUSTOM_CSS);
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf-8') : '';

describe('docs portal layout', () => {
  it('the Starlight config loads the custom stylesheet', () => {
    expect(config).toMatch(/customCss:\s*\[[^\]]*'\.\/src\/styles\/custom\.css'/);
    expect(existsSync(cssPath)).toBe(true);
  });

  it('widens the content column beyond the Starlight default on large screens', () => {
    const widths = [...css.matchAll(/--sl-content-width:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    expect(Math.max(...widths)).toBeGreaterThan(STARLIGHT_CONTENT_WIDTH_REM);
    // Only inside media queries: the phone layout keeps Starlight's own width.
    expect(css.replaceAll(/@media[^{]+\{[^{}]*\{[^{}]*\}[^{}]*\}/g, '')).not.toContain(
      '--sl-content-width',
    );
  });

  it('lets code inside a table cell break anywhere, so a long path cannot make the table scroll', () => {
    expect(css).toMatch(/:is\(th, td\) code[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
