/**
 * Copies the repository's Markdown into the Starlight content collection before every dev / build.
 * The repository files stay the single source (docs/standards/documentation.md); the copies under
 * src/content/docs/{overview,guides,standards}/ are generated, git-ignored and rebuilt from scratch.
 *
 * Per page: the first `# Heading` becomes the frontmatter title (Starlight renders it), and every
 * relative link is rewritten — to the page's portal URL when the target is synced, otherwise to
 * the file on GitHub (only known in GitHub Actions) or, locally, to plain text. The frontmatter
 * also carries the source's last commit date (`lastUpdated`; Starlight would read the git-ignored
 * copy) and, in GitHub Actions, an "Edit page" link to the source file (`editUrl`) — never for the
 * generated API contract, which is not edited by hand (R78).
 * Fails (exit 1) on a missing source, or when the sidebar and the synced pages disagree.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { SIDEBAR } from './sidebar.mjs';

const ROOT_DIR = resolve(import.meta.dir, '..');
const CONTENT_DIR = resolve(import.meta.dir, 'src/content/docs');
const GENERATED_DIRS = ['overview', 'guides', 'standards', 'api'];

const repository = Bun.env.GITHUB_REPOSITORY;
const repositoryUrl = repository
  ? `${Bun.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}`
  : undefined;
const blobBase = repositoryUrl && `${repositoryUrl}/blob/${Bun.env.GITHUB_SHA ?? 'main'}`;
// The branch the portal was built from (a pull request: its head branch), so an edit lands there.
const editBase =
  repositoryUrl &&
  `${repositoryUrl}/edit/${Bun.env.GITHUB_HEAD_REF || Bun.env.GITHUB_REF_NAME || 'main'}`;

/** Last commit date of a source file (ISO 8601), or undefined outside git / for an untracked file. */
const lastCommitDate = (source: string): string | undefined => {
  const log = Bun.spawnSync(['git', 'log', '-1', '--format=%cI', '--', source], {
    cwd: ROOT_DIR,
    stderr: 'pipe',
  });
  const date = log.exitCode === 0 ? log.stdout.toString().trim() : '';
  return date === '' ? undefined : date;
};

interface Page {
  /** Repository-relative source path, e.g. `docs/standards/cache.md`. */
  source: string;
  /** Portal slug, e.g. `standards/cache`. */
  slug: string;
  /** Content file when it is not `<slug>.md` (a folder index: `api/index.md` for slug `api`). */
  file?: string;
  description: string;
}

const standards = readdirSync(resolve(ROOT_DIR, 'docs/standards'))
  .filter((file) => file.endsWith('.md'))
  .sort();

/** The generated API contract (`bun run openapi:update`): README → the section index. */
const contract = readdirSync(resolve(ROOT_DIR, 'docs/api'), { recursive: true, encoding: 'utf8' })
  .map((path) => path.split('\\').join('/'))
  .filter((path) => path.endsWith('.md'))
  .sort()
  .map((path): Page =>
    path === 'README.md'
      ? {
          source: 'docs/api/README.md',
          slug: 'api',
          file: 'api/index.md',
          description: 'Kontrak API: envelope, autentikasi, modul, kode error',
        }
      : {
          source: `docs/api/${path}`,
          slug: `api/${path.replace(/\.md$/, '')}`,
          description: `Kontrak API modul ${path.replace(/\.md$/, '')}`,
        },
  );

const PAGES: Page[] = [
  {
    source: 'ARCHITECTURE.md',
    slug: 'overview/architecture',
    description: 'Architecture, invariants and the rule index with each rule’s enforcer',
  },
  {
    source: 'docs/decisions.md',
    slug: 'overview/decisions',
    description:
      'Every design decision (D0…) with its reason, the approved exceptions and the backlog',
  },
  {
    source: 'README.md',
    slug: 'overview/quickstart',
    description: 'Prasyarat, quickstart dan perintah utama',
  },
  {
    source: 'docs/auth-guide.md',
    slug: 'guides/auth-guide',
    description: 'Panduan integrasi frontend: login, refresh cookie, CSRF',
  },
  // partner:start
  {
    source: 'docs/partner-integration-guide.md',
    slug: 'guides/partner-integration-guide',
    description: 'Panduan teknis integrasi partner gateway dan HMAC signing v1',
  },
  // partner:end
  {
    source: 'docs/deployment.md',
    slug: 'guides/deployment',
    description: 'Image Docker, konfigurasi production, migrasi, health check',
  },
  ...standards.map((file) => ({
    source: `docs/standards/${file}`,
    slug: `standards/${file.replace(/\.md$/, '')}`,
    description: `Coding standard: ${file.replace(/\.md$/, '')}`,
  })),
  ...contract,
];

const slugBySource = new Map(PAGES.map((page) => [page.source, page.slug]));

const fail = (message: string): never => {
  console.error(`[sync-docs] ${message}`);
  process.exit(1);
};

/** Relative URL between two pages (`/<slug>/` routes), so it works under any `base`. */
const pageHref = (fromSlug: string, toSlug: string, anchor: string): string => {
  if (fromSlug === toSlug) return anchor || './';
  const relative = posix.relative(`/${fromSlug}`, `/${toSlug}`);
  return `${relative}/${anchor}`;
};

const LINK = /(!?)\[([^\]\n]*)\]\(([^)\s]+)\)/g;
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|#|\/\/)/i;

const rewriteLinks = (page: Page, markdown: string): string => {
  const sourceDir = posix.dirname(page.source);
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line.replace(LINK, (whole: string, bang: string, text: string, target: string) => {
        if (bang || EXTERNAL.test(target)) return whole;
        const hashAt = target.indexOf('#');
        const pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
        const anchor = hashAt === -1 ? '' : target.slice(hashAt);
        const repoPath = posix.normalize(posix.join(sourceDir, pathPart)).replace(/\/$/, '');
        if (repoPath.startsWith('..'))
          fail(`${page.source}: link leaves the repository: ${target}`);
        const targetSlug = slugBySource.get(repoPath);
        if (targetSlug) return `[${text}](${pageHref(page.slug, targetSlug, anchor)})`;
        if (blobBase) return `[${text}](${blobBase}/${repoPath}${anchor})`;
        return text;
      });
    })
    .join('\n');
};

const H1 = /^# (.+)\r?\n+/m;

const syncPage = (page: Page): void => {
  const sourcePath = resolve(ROOT_DIR, page.source);
  if (!existsSync(sourcePath)) fail(`Source file not found: ${page.source}`);
  const raw = readFileSync(sourcePath, 'utf-8');
  const heading = H1.exec(raw);
  if (!heading?.[1]) fail(`${page.source}: no "# Title" heading`);
  // Plain text: the title is also the sidebar label, where Markdown is not rendered.
  const title = (heading?.[1]?.trim() ?? '').replaceAll('`', '');
  const body = rewriteLinks(page, raw.replace(H1, ''));
  const updated = lastCommitDate(page.source);
  const generated = page.source.startsWith('docs/api/');
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(page.description)}`,
    // A YAML timestamp: Starlight receives a Date.
    ...(updated ? [`lastUpdated: ${updated}`] : []),
    `editUrl: ${editBase && !generated ? JSON.stringify(`${editBase}/${page.source}`) : 'false'}`,
    '---',
    '',
  ].join('\n');
  const targetPath = resolve(CONTENT_DIR, page.file ?? `${page.slug}.md`);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${frontmatter}${body}`, 'utf-8');
};

const checkSidebar = (): void => {
  type SidebarItem = { label: string; slug: string } | { autogenerate: { directory: string } };
  const items = SIDEBAR.flatMap((group): readonly SidebarItem[] => group.items);
  const inSidebar = new Set(items.flatMap((item) => ('slug' in item ? [item.slug] : [])));
  // `{ autogenerate: { directory } }` items list every page of their folder by themselves.
  const autogenerated = items.flatMap((item) =>
    'autogenerate' in item ? [item.autogenerate.directory] : [],
  );
  const synced = new Set(PAGES.map((page) => page.slug));
  const notInSidebar = [...synced].filter(
    (slug) =>
      !inSidebar.has(slug) &&
      !autogenerated.some((dir) => slug === dir || slug.startsWith(`${dir}/`)),
  );
  const noSource = [...inSidebar].filter((slug) => !synced.has(slug));
  if (notInSidebar.length > 0) fail(`Add to docs-site/sidebar.mjs: ${notInSidebar.join(', ')}`);
  if (noSource.length > 0) fail(`Sidebar slugs without a source document: ${noSource.join(', ')}`);
};

checkSidebar();
for (const dir of GENERATED_DIRS)
  rmSync(resolve(CONTENT_DIR, dir), { recursive: true, force: true });
for (const page of PAGES) syncPage(page);
console.log(
  `[sync-docs] ${PAGES.length} pages synced${blobBase ? ` (source links → ${blobBase})` : ''}`,
);
