/**
 * The partner switch of `bun run setup` (D39). The partner gateway lives in files of its own
 * (PARTNER_ONLY) and in marked regions of shared files. With the gateway, setup drops only the
 * marker lines; with `--no-partner` it drops the regions and the files too. The boilerplate's
 * `lint:setup` plans both and fails when a marker is unbalanced or when the pruned `src/`, `test/`
 * or `.env.example` would still mention a partner — so a new partner line must be marked.
 *
 * Markers are whole lines (indentation allowed), one region per place, never nested:
 * - `// partner:start` … `// partner:end` in TypeScript / JavaScript;
 * - `# partner:start` … `# partner:end` in `.env.example` and YAML;
 * - `<!-- partner:start -->` … `<!-- partner:end -->` in Markdown, and a Markdown line that ends
 *   with the line marker (LINE_MARKER) — inside a code fence, where a region marker would show —
 *   and a hidden replacement line (NO_PARTNER_LINE) that only a project without the gateway shows.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

/** Files and folders only the partner gateway needs: removed by `--no-partner`. */
export const PARTNER_ONLY: readonly string[] = [
  'src/modules/partner-credentials',
  'src/modules/partner-gateway',
  'src/config/partner.config.ts',
  'src/core/middlewares/partner-auth.ts',
  'src/core/middlewares/partner-auth.test.ts',
  'src/core/middlewares/require-partner.ts',
  'src/core/middlewares/require-partner.test.ts',
  'src/core/security/partner-credentials.ts',
  'src/core/security/partner-credentials.test.ts',
  'src/database/schema/domain/partner-credentials.schema.ts',
  'src/utils/partner-signature.util.ts',
  'src/utils/partner-signature.util.test.ts',
  'test/partner-credentials.e2e.test.ts',
  'test/partner-gateway.e2e.test.ts',
  'test/partner-guide.test.ts',
  'test/integration/partner.int.ts',
  'test/helpers/partner-signing-vectors.ts',
  'scripts/partner-sign.ts',
  'docs/partner-integration-guide.md',
  'docs/api/partner-credentials.md',
  'docs/api/partner-gateway.md',
  '.agents/skills/scaffold-module/references/partner.md',
];

/** `package.json` scripts only the partner gateway needs (JSON has no comments to mark). */
export const PARTNER_SCRIPTS: readonly string[] = ['scaffold:partner', 'partner:sign'];

/** Where a pruned project must not mention a partner any more (the rest is checked by its gates). */
const NO_TRACE_ROOTS = ['src/', 'test/', '.env.example'];

const STYLES = {
  slash: { start: '// partner:start', end: '// partner:end' },
  hash: { start: '# partner:start', end: '# partner:end' },
  html: { start: '<!-- partner:start -->', end: '<!-- partner:end -->' },
} as const;

type Style = keyof typeof STYLES;

/** Markdown only: a line ending with it is kept only with the gateway (works inside code fences). */
const LINE_MARKER = '<!-- partner -->';

/** Markdown only: a whole line `<!-- no-partner: <text> -->` becomes `<text>` without the gateway. */
const NO_PARTNER_LINE = /^<!-- no-partner: (.*) -->$/;

const styleOf = (file: string): Style | undefined => {
  if (file === '.env.example' || file.endsWith('/.env.example')) return 'hash';
  switch (extname(file)) {
    case '.ts':
    case '.mts':
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'slash';
    case '.yml':
    case '.yaml':
      return 'hash';
    // Not .mdx: an HTML comment is a syntax error in MDX.
    case '.md':
      return 'html';
    default:
      return undefined;
  }
};

/** Generated, installed or local folders: never scanned. */
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.astro', 'drizzle']);

export class PartnerMarkerError extends Error {}

/**
 * The content with the marker lines removed (`keepPartner`) or with every region removed, and the
 * number of regions. Throws PartnerMarkerError for an unbalanced or nested marker.
 */
export const pruneRegions = (
  content: string,
  file: string,
  keepPartner: boolean,
): { content: string; regions: number } => {
  const style = styleOf(file);
  if (style === undefined) return { content, regions: 0 };
  const { start, end } = STYLES[style];
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const kept: string[] = [];
  let openedAt: number | undefined;
  let regions = 0;
  content.split(eol).forEach((line, index) => {
    const marker = line.trim();
    const replacement = style === 'html' ? NO_PARTNER_LINE.exec(marker) : null;
    if (replacement) {
      regions += 1;
      if (!keepPartner) kept.push(`${/^\s*/.exec(line)?.[0] ?? ''}${replacement[1]}`);
      return;
    }
    if (style === 'html' && marker !== LINE_MARKER && marker.endsWith(LINE_MARKER)) {
      regions += 1;
      if (keepPartner) kept.push(line.trimEnd().slice(0, -LINE_MARKER.length).trimEnd());
      return;
    }
    if (marker === start) {
      if (openedAt !== undefined) {
        throw new PartnerMarkerError(
          `${file}:${index + 1}: "${start}" inside the region opened at line ${openedAt}`,
        );
      }
      openedAt = index + 1;
      return;
    }
    if (marker === end) {
      if (openedAt === undefined) {
        throw new PartnerMarkerError(`${file}:${index + 1}: "${end}" without "${start}"`);
      }
      openedAt = undefined;
      regions += 1;
      return;
    }
    if (keepPartner || openedAt === undefined) kept.push(line);
  });
  if (openedAt !== undefined) {
    throw new PartnerMarkerError(`${file}:${openedAt}: "${start}" is never closed by "${end}"`);
  }
  return { content: kept.join(eol), regions };
};

/** `package.json` without the partner scripts, formatted like the original. */
export const withoutPartnerScripts = (packageJson: string): string => {
  const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
  for (const name of PARTNER_SCRIPTS) delete parsed.scripts?.[name];
  return `${JSON.stringify(parsed, null, 2)}\n`;
};

const markedFiles = (rootDir: string, dir = rootDir): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : markedFiles(rootDir, path);
    // Only the env template: the local env files hold secrets and are never read.
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') return [];
    const file = relative(rootDir, path).replaceAll('\\', '/');
    return styleOf(file) === undefined ? [] : [file];
  });

export interface PartnerPlan {
  /** Files whose content changes, by path relative to the root. */
  edits: Map<string, string>;
  /** PARTNER_ONLY paths to delete (only without the gateway). */
  remove: string[];
  /** Marked regions found. */
  regions: number;
  /** Everything that stops setup before it writes: bad markers, missing files, partner traces. */
  problems: string[];
}

const isInNoTraceRoot = (file: string): boolean =>
  NO_TRACE_ROOTS.some((root) => (root.endsWith('/') ? file.startsWith(root) : file === root));

const isPartnerOnly = (file: string): boolean =>
  PARTNER_ONLY.some((path) => file === path || file.startsWith(`${path}/`));

/**
 * What setup does to the partner gateway, computed in memory. `pending` holds contents an earlier
 * setup step already changed (read instead of the file). With the gateway the plan only drops the
 * markers; the no-partner prune is still simulated so a missing marker fails both modes alike.
 */
export const planPartner = (
  rootDir: string,
  keepPartner: boolean,
  pending: ReadonlyMap<string, string> = new Map(),
): PartnerPlan => {
  const plan: PartnerPlan = { edits: new Map(), remove: [], regions: 0, problems: [] };
  const read = (file: string): string =>
    pending.get(file) ?? readFileSync(resolve(rootDir, file), 'utf-8');
  const traces: string[] = [];

  for (const file of markedFiles(rootDir)) {
    if (isPartnerOnly(file)) continue;
    const content = read(file);
    try {
      const kept = pruneRegions(content, file, true);
      const pruned = pruneRegions(content, file, false);
      plan.regions += kept.regions;
      if (isInNoTraceRoot(file)) {
        pruned.content.split(/\r?\n/).forEach((line, index) => {
          if (/partner/i.test(line)) {
            traces.push(`${file}:${index + 1}: partner outside a marked region: ${line.trim()}`);
          }
        });
      }
      const next = keepPartner ? kept.content : pruned.content;
      if (next !== content) plan.edits.set(file, next);
    } catch (error) {
      if (!(error instanceof PartnerMarkerError)) throw error;
      plan.problems.push(error.message);
    }
  }

  const present = PARTNER_ONLY.filter((path) => existsSync(resolve(rootDir, path)));
  const packageJson = read('package.json');
  if ((JSON.parse(packageJson) as { boilerplate?: unknown }).boilerplate !== undefined) {
    // An initialized project (setup recorded its origin): the markers are gone and the gateway,
    // when kept, is the project's own code.
    if (!keepPartner && present.length > 0) {
      plan.problems.push(
        'the partner markers were removed by an earlier setup: remove the gateway by hand (docs/standards/project-setup.md)',
      );
    }
    return { edits: new Map(), remove: [], regions: 0, problems: plan.problems };
  }
  if (plan.regions === 0) plan.problems.push('no partner markers found in the boilerplate');
  plan.problems.push(...traces);
  for (const path of PARTNER_ONLY) {
    if (!present.includes(path)) plan.problems.push(`${path}: not found (PARTNER_ONLY)`);
  }
  if (!keepPartner) {
    plan.remove.push(...present);
    plan.edits.set('package.json', withoutPartnerScripts(packageJson));
  }
  return plan;
};
