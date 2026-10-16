/**
 * Runs after `astro build`: every internal `href` / `src` in dist/ must point at a built file,
 * and every `#anchor` at an element id of its target page. Fails (exit 1) with the broken links,
 * so a renamed section or a link to an unsynced file is caught before deployment.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { posix, resolve } from 'node:path';

const DIST_DIR = resolve(import.meta.dir, 'dist');
const BASE = `/${(Bun.env.DOCS_BASE ?? '').replace(/^\/|\/$/g, '')}/`.replace('//', '/');

const htmlFiles = readdirSync(DIST_DIR, { recursive: true, encoding: 'utf8' })
  .map((path) => path.split('\\').join('/'))
  .filter((path) => path.endsWith('.html'));

const idsCache = new Map<string, Set<string>>();
const idsOf = (file: string): Set<string> => {
  const cached = idsCache.get(file);
  if (cached) return cached;
  const html = readFileSync(resolve(DIST_DIR, file), 'utf-8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? ''));
  idsCache.set(file, ids);
  return ids;
};

/** dist-relative file for a site path (`/base/standards/cache/` → `standards/cache/index.html`). */
const fileFor = (sitePath: string): string | undefined => {
  if (!sitePath.startsWith(BASE)) return undefined;
  const path = decodeURIComponent(sitePath.slice(BASE.length));
  const candidates =
    path === '' || path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`];
  return candidates.find((candidate) => existsSync(resolve(DIST_DIR, candidate)));
};

const broken: string[] = [];
for (const file of htmlFiles) {
  const html = readFileSync(resolve(DIST_DIR, file), 'utf-8');
  const pageUrl = `${BASE}${file.replace(/index\.html$/, '')}`;
  for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const link = (match[1] ?? '').replaceAll('&amp;', '&');
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;
    const [pathPart = '', anchor] = link.split('#');
    const sitePath = posix.resolve(posix.dirname(`${pageUrl}x`), pathPart.split('?')[0] ?? '');
    const resolved =
      pathPart === ''
        ? pageUrl
        : `${sitePath}${pathPart.endsWith('/') && sitePath !== '/' ? '/' : ''}`;
    const target = pathPart === '' ? file : fileFor(resolved);
    if (!target) broken.push(`${file}: ${link}`);
    else if (anchor && anchor !== '_top' && !idsOf(target).has(decodeURIComponent(anchor))) {
      broken.push(`${file}: ${link} (missing anchor)`);
    }
  }
}

if (broken.length > 0) {
  console.error(`[check-links] ${broken.length} broken link(s):\n${broken.join('\n')}`);
  process.exit(1);
}
console.log(`[check-links] ${htmlFiles.length} pages, no broken internal links`);
