/**
 * Shared engine of `bun run scaffold` (scripts/scaffold.ts) and `bun run verify:scaffold`.
 *
 * The scaffold-module skill's Markdown is the only copy of template code (plan D31): this module
 * reads its `### Step N: … (\`src/…\`)` code blocks, fills the placeholders and computes the
 * registrations in shared files. Everything here is pure — it returns a plan (files to create,
 * edits to apply, next steps) and never writes, so the CLI can apply it all-or-nothing or print it
 * with `--dry-run`, and the tests can check it without touching the repository.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SKILL_DIR = '.agents/skills/scaffold-module';
export const APP_PATH = 'src/app.ts';
export const SCHEMA_BARREL = 'src/database/schema/domain/index.ts';
export const APPEND_ONLY_PATH = 'src/database/schema/append-only-tables.ts';
export const REGISTRY_PATH = 'src/integrations/registry.ts';
export const CONFIG_BARREL = 'src/config/index.ts';
/** The canonical tree names every module (test/docs-sync.test.ts): a new one gets its line. */
export const STRUCTURE_PATH = 'docs/standards/structure.md';

/** Permanent markers in `src/app.ts`: new lines go directly above them. */
export const APP_MARKERS = {
  imports: '// scaffold:imports',
  webhookRoutes: '  // scaffold:webhook-routes',
  v1Routes: '  // scaffold:v1-routes',
} as const;

export type ScaffoldKind = 'module' | 'partner' | 'webhook' | 'integration';
/** Table kind of a module; a dependent module (`--parent`) is a standalone variant with a parent. */
export type ModuleVariant = 'standalone' | 'header-detail' | 'record';
export const MODULE_VARIANTS: readonly ModuleVariant[] = ['standalone', 'header-detail', 'record'];

export class ScaffoldError extends Error {}

export interface Names {
  name: string;
  snakePlural: string;
  snakeSingular: string;
  upperSingular: string;
  pascalPlural: string;
  camelPlural: string;
  pascalSingular: string;
  camelSingular: string;
}

export interface VendorNames {
  kebab: string;
  upper: string;
  camel: string;
  pascal: string;
}

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const assertKebabCase = (value: string, what: string): void => {
  if (!KEBAB.test(value)) {
    throw new ScaffoldError(
      `${what} must be kebab-case (lowercase letters, digits, single hyphens), got "${value}"`,
    );
  }
};

const pascal = (kebab: string): string =>
  kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
const camel = (kebab: string): string => {
  const value = pascal(kebab);
  return value.charAt(0).toLowerCase() + value.slice(1);
};
const snake = (kebab: string): string => kebab.split('-').join('_');

/**
 * The singular of a plural kebab-case name, by simple English rules on its last word:
 * `categories` → `category`, `boxes` / `addresses` / `batches` / `statuses` → `box` / `address` /
 * `batch` / `status`, `products` → `product`. A word that already looks singular (`status`,
 * `analysis`, `address`) or is not plural needs `--singular`; irregular plurals (`people`) too.
 * The CLI prints the singular it used, so a wrong guess (`news` → `new`) shows up in `--dry-run`.
 */
/** How a refused name is retried: the full command with the suggested plural, or the bare name. */
type Retry = (plural: string) => string;

export const singularOf = (
  plural: string,
  retry: Retry = (guess) => guess,
  rule = 'Module names are plural: they name the module folder, its table and its routes.',
  flag = '--singular',
): string => {
  const cut = plural.lastIndexOf('-');
  const head = cut < 0 ? '' : plural.slice(0, cut + 1);
  const word = plural.slice(cut + 1);
  if (/[^aeiou]ies$/.test(word)) return `${head}${word.slice(0, -3)}y`;
  if (/(ss|x|z|ch|sh|us)es$/.test(word)) return head + word.slice(0, -2);
  if (/s$/.test(word) && !/(ss|us|is)$/.test(word)) return head + word.slice(0, -1);
  const why = /s$/.test(word)
    ? `"${plural}" looks singular (it ends in -${word.slice(-2)})`
    : `"${plural}" does not look plural (it does not end in -s)`;
  throw new ScaffoldError(
    [
      `${why}. ${rule}`,
      `  Did you mean "${pluralGuess(plural)}"?  →  ${retry(pluralGuess(plural))}`,
      `  If "${plural}" really is a plural, give its singular:  ${flag}=<name>  (e.g. people ${flag}=person)`,
    ].join('\n'),
  );
};

/** A plural suggestion for a name that does not look plural: `product` → `products`, `category` → `categories`, `status` → `statuses`. */
export const pluralGuess = (name: string): string => {
  const cut = name.lastIndexOf('-');
  const head = cut < 0 ? '' : name.slice(0, cut + 1);
  const word = name.slice(cut + 1);
  if (/[^aeiou]y$/.test(word)) return `${head}${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${head}${word}es`;
  return `${head}${word}s`;
};

/** Every spelling the templates use, from a plural kebab-case name (and its singular). */
export const deriveNames = (
  name: string,
  singular: string = singularOf(name),
  retry: Retry = (guess) => guess,
): Names => {
  assertKebabCase(name, 'name');
  assertKebabCase(singular, '--singular');
  if (singular === name) {
    throw new ScaffoldError(
      `the singular must differ from the name ("${name}"): the templates need both forms (e.g. products / product). Use a plural name — did you mean "${pluralGuess(name)}"?  →  ${retry(pluralGuess(name))}`,
    );
  }
  return {
    name,
    snakePlural: snake(name),
    snakeSingular: snake(singular),
    upperSingular: snake(singular).toUpperCase(),
    pascalPlural: pascal(name),
    camelPlural: camel(name),
    pascalSingular: pascal(singular),
    camelSingular: camel(singular),
  };
};

/** An outbound adapter is named after its vendor (singular): only the singular forms are used. */
export const deriveAdapterNames = (vendor: string): Names => {
  assertKebabCase(vendor, 'vendor');
  return {
    name: vendor,
    snakePlural: snake(vendor),
    snakeSingular: snake(vendor),
    upperSingular: snake(vendor).toUpperCase(),
    pascalPlural: pascal(vendor),
    camelPlural: camel(vendor),
    pascalSingular: pascal(vendor),
    camelSingular: camel(vendor),
  };
};

export const deriveVendorNames = (vendor: string): VendorNames => {
  assertKebabCase(vendor, '--vendor');
  return {
    kebab: vendor,
    upper: snake(vendor).toUpperCase(),
    camel: camel(vendor),
    pascal: pascal(vendor),
  };
};

/** The detail of a header-detail module (`items`, `members`, `line-items`): plural, in every spelling. */
export interface DetailNames {
  kebabPlural: string;
  kebabSingular: string;
  snakePlural: string;
  camelPlural: string;
  camelSingular: string;
  pascalPlural: string;
  pascalSingular: string;
  upperSingular: string;
  upperPlural: string;
}

/** The detail name every header-detail module gets unless `--detail` says otherwise. */
export const DEFAULT_DETAIL = 'items';

export const deriveDetailNames = (
  plural: string,
  singular: string = singularOf(plural),
  retry: Retry = (guess) => guess,
): DetailNames => {
  assertKebabCase(plural, '--detail');
  assertKebabCase(singular, '--detail-singular');
  if (singular === plural) {
    throw new ScaffoldError(
      `the detail's singular must differ from "${plural}": the templates need both forms (e.g. members / member). Did you mean "${pluralGuess(plural)}"?  →  ${retry(pluralGuess(plural))}`,
    );
  }
  return {
    kebabPlural: plural,
    kebabSingular: singular,
    snakePlural: snake(plural),
    camelPlural: camel(plural),
    camelSingular: camel(singular),
    pascalPlural: pascal(plural),
    pascalSingular: pascal(singular),
    upperSingular: snake(singular).toUpperCase(),
    upperPlural: snake(plural).toUpperCase(),
  };
};

/** `acme-pay` → `Acme Pay` (the default `institution` of a registry entry). */
export const titleOf = (kebab: string): string =>
  kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * Replaces every placeholder of the templates (vendor placeholders only when a vendor is given,
 * detail placeholders only for a header-detail module, parent placeholders and `<segment>` only for a
 * dependent module).
 */
export const fill = (
  text: string,
  names: Names,
  vendor?: VendorNames,
  detail?: DetailNames,
  parent?: Names,
  segment?: string,
): string =>
  (
    [
      [/<parent-name>/g, parent?.name ?? '<parent-name>'],
      [/<parentCamelPlural>/g, parent?.camelPlural ?? '<parentCamelPlural>'],
      [/<parent_snake_plural>/g, parent?.snakePlural ?? '<parent_snake_plural>'],
      [/<parentCamelSingular>/g, parent?.camelSingular ?? '<parentCamelSingular>'],
      [/<ParentPascalSingular>/g, parent?.pascalSingular ?? '<ParentPascalSingular>'],
      [/<parent_snake_singular>/g, parent?.snakeSingular ?? '<parent_snake_singular>'],
      [/<segment>/g, segment ?? '<segment>'],
      [/<DetailPascalPlural>/g, detail?.pascalPlural ?? '<DetailPascalPlural>'],
      [/<DetailPascalSingular>/g, detail?.pascalSingular ?? '<DetailPascalSingular>'],
      [/<detailCamelPlural>/g, detail?.camelPlural ?? '<detailCamelPlural>'],
      [/<detailCamelSingular>/g, detail?.camelSingular ?? '<detailCamelSingular>'],
      [/<detail-plural>/g, detail?.kebabPlural ?? '<detail-plural>'],
      [/<detail_snake_plural>/g, detail?.snakePlural ?? '<detail_snake_plural>'],
      [/<DETAIL_UPPER_SINGULAR>/g, detail?.upperSingular ?? '<DETAIL_UPPER_SINGULAR>'],
      [/<DETAIL_UPPER_PLURAL>/g, detail?.upperPlural ?? '<DETAIL_UPPER_PLURAL>'],
      [/<vendorCamel>/g, vendor?.camel ?? '<vendorCamel>'],
      [/<VendorPascal>/g, vendor?.pascal ?? '<VendorPascal>'],
      [/<VENDOR>/g, vendor?.upper ?? '<VENDOR>'],
      [/<vendor>/g, vendor?.kebab ?? '<vendor>'],
      [/<snake_plural>/g, names.snakePlural],
      [/<snake_singular>/g, names.snakeSingular],
      [/<UPPER_SINGULAR>/g, names.upperSingular],
      [/<PascalPlural>/g, names.pascalPlural],
      [/<camelPlural>/g, names.camelPlural],
      [/<PascalSingular>/g, names.pascalSingular],
      [/<camelSingular>/g, names.camelSingular],
      [/<name>/g, names.name],
    ] as [RegExp, string][]
  ).reduce((result, [pattern, value]) => result.replace(pattern, () => value), text);

/** `product` / `line-item`: the singular in kebab-case (routes of a 1:1 dependent). */
const kebabSingularOf = (names: Names): string => names.snakeSingular.split('_').join('-');

export interface PlannedFile {
  path: string;
  content: string;
}

/**
 * The files a template creates: the code block under every `### Step N: … (\`src/…\`)` heading,
 * except steps that edit a shared file (those are registrations, computed by the plan instead).
 */
export const materialize = (
  template: string,
  names: Names,
  registrations: readonly string[],
  vendor?: VendorNames,
  detail?: DetailNames,
  parent?: Names,
  segment?: string,
): PlannedFile[] => {
  const text = template.split('\r\n').join('\n');
  const stepPattern = /### Step \d+: [^\n]*\(`(src\/[^`]+)`\)[\s\S]*?```typescript\n([\s\S]*?)```/g;
  const files = [...text.matchAll(stepPattern)].flatMap((match) => {
    const path = fill(match.at(1) ?? '', names, vendor, detail, parent, segment);
    return registrations.includes(path)
      ? []
      : [{ path, content: fill(match.at(2) ?? '', names, vendor, detail, parent, segment) }];
  });
  if (files.length === 0) throw new ScaffoldError('no template code blocks found');
  return files;
};

/**
 * Replaces the first match of an anchor that must be there — a missing anchor fails loudly instead
 * of leaving the registration out. `replace` gets the match and the regex groups, if any.
 */
export const replaceAnchor = (
  content: string,
  anchor: string | RegExp,
  replace: (match: string, ...groups: string[]) => string,
): string => {
  const found = typeof anchor === 'string' ? content.includes(anchor) : anchor.test(content);
  if (!found) throw new ScaffoldError(`registration anchor not found: ${String(anchor)}`);
  return typeof anchor === 'string'
    ? content.replace(anchor, () => replace(anchor))
    : // The callback receives the groups, then the offset and the whole string.
      content.replace(anchor, (match, ...rest: unknown[]) =>
        replace(
          match,
          ...rest.slice(0, -2).map((group) => (typeof group === 'string' ? group : '')),
        ),
      );
};

/** Inserts `lines` directly above a marker line. */
const aboveMarker = (content: string, marker: string, lines: string[]): string =>
  replaceAnchor(content, marker, (found) => `${lines.join('\n')}\n${found}`);

export interface PlannedEdit {
  path: string;
  label: string;
  /** Pure: LF content in, LF content out. */
  apply: (content: string) => string;
}

export interface ScaffoldRequest {
  kind: ScaffoldKind;
  name: string;
  variant?: ModuleVariant;
  singular?: string;
  vendor?: string;
  institution?: string;
  /** Header-detail only: the detail's plural name (default `items`) and its singular. */
  detail?: string;
  detailSingular?: string;
  /** Dependent module only (plan D33): the existing parent module, its singular, 1:1 or 1:N. */
  parent?: string;
  parentSingular?: string;
  one?: boolean;
}

export interface ScaffoldPlan {
  label: string;
  template: string;
  files: PlannedFile[];
  edits: PlannedEdit[];
  nextSteps: string[];
  /**
   * The name the module is created under when it differs from the requested one (a dependent module
   * is prefixed with its parent's singular: `documents` under `orders` → `order-documents`).
   */
  moduleName?: string;
  /** Dependent module: the parent (checked against the repository by the CLI) and the route segment under it. */
  parent?: { names: Names; segment: string };
}

const templateOf = (request: ScaffoldRequest): string => {
  if (request.kind === 'partner') return `${SKILL_DIR}/references/partner.md`;
  if (request.kind === 'webhook') return `${SKILL_DIR}/references/webhook.md`;
  if (request.kind === 'integration') return `${SKILL_DIR}/references/integration.md`;
  if (request.parent !== undefined) {
    return `${SKILL_DIR}/references/${request.one ? 'dependent-one' : 'dependent'}.md`;
  }
  const variant = request.variant ?? 'standalone';
  return variant === 'standalone'
    ? `${SKILL_DIR}/SKILL.md`
    : `${SKILL_DIR}/references/${variant}.md`;
};

const appendExport = (path: string, label: string, from: string): PlannedEdit => ({
  path,
  label,
  apply: (content) =>
    `${content.endsWith('\n') || content === '' ? content : `${content}\n`}export * from '${from}';\n`,
});

const registryEntry = (code: string, institution: string): PlannedEdit => ({
  path: REGISTRY_PATH,
  label: `INTEGRATION_REGISTRY entry ${code}`,
  apply: (content) =>
    replaceAnchor(
      content,
      /(export const INTEGRATION_REGISTRY = \{\n)/,
      (_match, head = '') =>
        `${head}  ${code}: { code: '${code}', institution: '${institution.split("'").join("\\'")}' },\n`,
    ),
});

/**
 * The module's line in the canonical tree of structure.md, above the permanent `users/` entry
 * (its last line), aligned like the others.
 */
const structureLine = (name: string, description: string): PlannedEdit => ({
  path: STRUCTURE_PATH,
  label: `list src/modules/${name}/ in the canonical tree`,
  apply: (content) =>
    replaceAnchor(content, /^│ {3}└── users\/ /m, (found) => {
      const folder = `${name}/`;
      return `│   ├── ${folder.padEnd(25)}${folder.length >= 25 ? ' ' : ''}# ${description}\n${found}`;
    }),
});

/**
 * A dependent module's line in the canonical tree, right under its parent's line (and the
 * parent's other dependents), one level deeper.
 */
const nestedStructureLine = (parent: string, name: string, description: string): PlannedEdit => ({
  path: STRUCTURE_PATH,
  label: `list src/modules/${parent}/${name}/ under its parent in the canonical tree`,
  apply: (content) =>
    replaceAnchor(
      content,
      new RegExp(`^│   ([├└])── ${parent}/[^\\n]*\\n((?:│   [│ ]   [├└]── [^\\n]*\\n)*)`, 'm'),
      (found, connector = '├') => {
        const folder = `${name}/`;
        const prefix = connector === '└' ? '│       ├── ' : '│   │   ├── ';
        return `${found}${prefix}${folder.padEnd(21)}${folder.length >= 21 ? ' ' : ''}# ${description}\n`;
      },
    ),
});

/** Environment variables a generated config group declares (`NAME: z.…`). */
const envVarsOf = (files: PlannedFile[]): string[] =>
  files
    .filter((file) => file.path.startsWith('src/config/'))
    .flatMap((file) =>
      [...file.content.matchAll(/^\s+([A-Z][A-Z0-9_]+): z\./gm)].map((m) => m.at(1) ?? ''),
    );

/** The plan for one scaffold request: files to create, shared-file edits, what to do next. */
export const planScaffold = (request: ScaffoldRequest, root = '.'): ScaffoldPlan => {
  const template = templateOf(request);
  const text = readFileSync(resolve(root, template), 'utf8');

  if (request.kind === 'integration') {
    const names = deriveAdapterNames(request.name);
    const files = materialize(text, names, [REGISTRY_PATH, CONFIG_BARREL]);
    return {
      label: `integration ${names.name}`,
      template,
      files,
      edits: [
        registryEntry(names.upperSingular, request.institution ?? titleOf(names.name)),
        appendExport(CONFIG_BARREL, `export ./${names.name}.config`, `./${names.name}.config`),
      ],
      nextSteps: [
        `Add ${envVarsOf(files).join(', ')} to .env.example (and the plan's env registry, L1).`,
        `Replace the example endpoints and payloads in src/integrations/${names.name}/ with the vendor's documented API.`,
        `Consume ${names.camelSingular}Service from a domain service (constructor default) and document 502/504 on its routes.`,
      ],
    };
  }

  // A refused name is answered with the command to run instead (same kind and options).
  const retry: Retry = (guess) =>
    [
      `bun run scaffold ${request.kind} ${guess}`,
      ...(request.variant ? [`--variant=${request.variant}`] : []),
      ...(request.vendor ? [`--vendor=${request.vendor}`] : []),
      ...(request.detail ? [`--detail=${request.detail}`] : []),
      ...(request.parent ? [`--parent=${request.parent}`] : []),
      ...(request.one ? ['--one'] : []),
    ].join(' ');
  const names = deriveNames(
    request.name,
    request.singular ?? singularOf(request.name, retry),
    retry,
  );

  if (request.kind === 'webhook') {
    if (request.vendor === undefined) throw new ScaffoldError('webhook needs --vendor=<vendor>');
    const vendor = deriveVendorNames(request.vendor);
    if (vendor.kebab === names.name) {
      throw new ScaffoldError(
        'the module is named after its domain, never after the vendor (plan D26)',
      );
    }
    const files = materialize(text, names, [APP_PATH], vendor);
    const routes = `${names.camelPlural}WebhookRoutes`;
    return {
      label: `webhook ${names.name} (singular ${names.snakeSingular.split('_').join('-')}, vendor ${vendor.kebab})`,
      template,
      files,
      edits: [
        {
          path: APP_PATH,
          label: `register ${vendor.camel}Webhook and ${routes}`,
          apply: (content) => {
            let next = aboveMarker(content, APP_MARKERS.imports, [
              `import { ${vendor.camel}Webhook } from './integrations/${vendor.kebab}/${vendor.kebab}.webhook';`,
              `import { ${routes} } from './modules/${names.name}/${names.name}.webhook.routes';`,
            ]);
            next = replaceAnchor(
              next,
              /(WEBHOOK_VENDORS: readonly WebhookVendor\[\] = \[)([^\]]*)\]/,
              (_match, head = '', listed = '') =>
                `${head}${listed.trim() === '' ? '' : `${listed.trim()}, `}${vendor.camel}Webhook]`,
            );
            return aboveMarker(next, APP_MARKERS.webhookRoutes, [
              `  app.route(\`\${webhooksPath}/\${${vendor.camel}Webhook.vendor}\`, ${routes});`,
            ]);
          },
        },
        appendExport(CONFIG_BARREL, `export ./${vendor.kebab}.config`, `./${vendor.kebab}.config`),
        structureLine(
          names.name,
          `Vendor webhook receiver (POST /api/webhooks/${vendor.kebab}, idempotent)`,
        ),
        registryEntry(vendor.upper, request.institution ?? titleOf(vendor.kebab)),
      ],
      nextSteps: [
        `Add ${envVarsOf(files).join(', ')} to .env.example (and the plan's env registry, L1); empty secret = every webhook 401.`,
        `Replace the placeholder signature scheme in src/integrations/${vendor.kebab}/${vendor.kebab}.webhook.ts with exactly the vendor's documented one, and the payload schema with the vendor's.`,
        `Adjust the domain processing in src/modules/${names.name}/${names.name}.service.ts.`,
      ],
    };
  }

  if (request.parent !== undefined) return planDependent(request, text, template, names);

  // A module: standalone, header-detail or record (users with access tokens), or partner.
  const isHeaderDetail = request.kind === 'module' && request.variant === 'header-detail';
  const detailName = request.detail ?? DEFAULT_DETAIL;
  // A refused detail name is answered with the same command and the suggested --detail.
  const retryDetail: Retry = (guess) =>
    `bun run scaffold module ${names.name} --variant=header-detail --detail=${guess}`;
  const detail = isHeaderDetail
    ? deriveDetailNames(
        detailName,
        request.detailSingular ??
          singularOf(
            detailName,
            retryDetail,
            'Detail names are plural: they name the detail table and its routes.',
            '--detail-singular',
          ),
        retryDetail,
      )
    : undefined;
  const files = materialize(text, names, [APP_PATH], undefined, detail);
  const isPartner = request.kind === 'partner';
  const variant = isPartner ? 'partner' : (request.variant ?? 'standalone');
  const router = isPartner
    ? {
        file: `${names.name}.partner.routes`,
        symbol: `${names.camelPlural}PartnerRoutes`,
        mount: `/partner/${names.name}`,
      }
    : {
        file: `${names.name}.routes`,
        symbol: `${names.camelPlural}Router`,
        mount: `/${names.name}`,
      };
  const edits: PlannedEdit[] = [
    appendExport(SCHEMA_BARREL, `export ./${names.name}.schema`, `./${names.name}.schema`),
    {
      path: APP_PATH,
      label: `register ${router.symbol} on ${router.mount}`,
      apply: (content) =>
        aboveMarker(
          aboveMarker(content, APP_MARKERS.imports, [
            `import { ${router.symbol} } from './modules/${names.name}/${router.file}';`,
          ]),
          APP_MARKERS.v1Routes,
          [`  v1.route('${router.mount}', ${router.symbol});`],
        ),
    },
  ];
  edits.push(
    structureLine(
      names.name,
      {
        standalone: `Standalone-table module (/api/v1/${names.name})`,
        'header-detail': `Header + detail module (/api/v1/${names.name}[/:id/${detail?.kebabPlural ?? DEFAULT_DETAIL}])`,
        record: `Record (append-only) module (/api/v1/${names.name})`,
        partner: `Partner endpoints (/api/v1/partner/${names.name})`,
      }[variant],
    ),
  );
  if (variant === 'record') {
    edits.push({
      path: APPEND_ONLY_PATH,
      label: `APPEND_ONLY_TABLES entry ${names.snakePlural}`,
      apply: (content) =>
        replaceAnchor(
          content,
          /(export const APPEND_ONLY_TABLES[^{]*\{\n)/,
          (_match, head = '') =>
            `${head}  ${names.snakePlural}: 'append-only records (bun run scaffold): state why this table is append-only',\n`,
        ),
    });
  }
  return {
    label: `${variant} module ${names.name} (singular ${names.snakeSingular.split('_').join('-')}${
      detail
        ? `; detail ${detail.kebabPlural} (singular ${detail.kebabSingular}), table ${names.snakeSingular}_${detail.snakePlural}`
        : ''
    })`,
    template,
    files,
    edits,
    nextSteps: [
      `Adjust the domain fields in the schema, DTOs, messages (Indonesian nouns) and tests of src/modules/${names.name}/.`,
      ...(variant === 'record'
        ? [`Write the reason of ${names.snakePlural} in APPEND_ONLY_TABLES.`]
        : []),
      ...(isPartner
        ? [
            `Add /${names.name} and /${names.name}/* to the allowed_routes of the partner credentials that may call it.`,
          ]
        : []),
      "Generate the migration: bun run db:generate (applying it is the developer's call).",
    ],
  };
};

/**
 * A dependent module (plan D33): its own module next to an existing parent module, which is never
 * edited. Routes in shallow nesting — the collection under the parent, rows by their own id.
 */
const planDependent = (
  request: ScaffoldRequest,
  text: string,
  template: string,
  typed: Names,
): ScaffoldPlan => {
  const parentName = request.parent ?? '';
  const retryParent: Retry = (guess) =>
    `bun run scaffold module ${typed.name} --parent=${guess}${request.one ? ' --one' : ''}`;
  const parent = deriveNames(
    parentName,
    request.parentSingular ??
      singularOf(
        parentName,
        retryParent,
        'The parent is an existing module, named in the plural like its folder.',
        '--parent-singular',
      ),
    retryParent,
  );
  if (parent.name === typed.name) throw new ScaffoldError('a module cannot be its own parent');

  // The module is named after its parent (`order-documents`, never `documents`): its table and flat
  // routes then never collide with another parent's (`invoice-documents`), as a header-detail's
  // table `order_items` does not. The route under the parent keeps the short name, and typing the
  // full name gives the same module.
  const prefix = `${kebabSingularOf(parent)}-`;
  const short = (value: string): string =>
    value.startsWith(prefix) ? value.slice(prefix.length) : value;
  const shortName = short(typed.name);
  const shortSingular = short(kebabSingularOf(typed));
  const names = deriveNames(`${prefix}${shortName}`, `${prefix}${shortSingular}`);

  const segment = request.one ? shortSingular : shortName;
  const nested = `/${parent.name}/:${parent.camelSingular}Id/${segment}`;
  const files = materialize(text, names, [APP_PATH], undefined, undefined, parent, segment);
  const routers = {
    nested: `${names.camelPlural}ParentRouter`,
    own: `${names.camelPlural}Router`,
  };
  return {
    label: `dependent module ${names.name} in src/modules/${parent.name}/${names.name}/ (singular ${kebabSingularOf(names)}; ${request.one ? '1:1' : '1:N'}, ${nested})`,
    template,
    moduleName: names.name,
    files,
    edits: [
      appendExport(SCHEMA_BARREL, `export ./${names.name}.schema`, `./${names.name}.schema`),
      {
        path: APP_PATH,
        label: `register ${routers.nested} on ${nested} and ${routers.own} on /${names.name}`,
        apply: (content) =>
          aboveMarker(
            aboveMarker(content, APP_MARKERS.imports, [
              `import { ${routers.nested}, ${routers.own} } from './modules/${parent.name}/${names.name}/${names.name}.routes';`,
            ]),
            APP_MARKERS.v1Routes,
            [
              `  v1.route('${nested}', ${routers.nested});`,
              `  v1.route('/${names.name}', ${routers.own});`,
            ],
          ),
      },
      nestedStructureLine(
        parent.name,
        names.name,
        `Dependent ${request.one ? '1:1' : '1:N'} (/api/v1${nested}, /api/v1/${names.name}/:id)`,
      ),
    ],
    nextSteps: [
      `Adjust the domain fields in the schema, DTOs, messages (Indonesian nouns) and tests of src/modules/${parent.name}/${names.name}/.`,
      `When ${parent.name} rows are owned (by a user or a partner), override parentScope() in src/modules/${parent.name}/${names.name}/${names.name}.repository.ts: another owner's rows then answer 404. To lock these rows by the parent's state, override assertParentWritable().`,
      "Generate the migration: bun run db:generate (applying it is the developer's call).",
    ],
    parent: { names: parent, segment },
  };
};

export interface ParsedArgs {
  request: ScaffoldRequest;
  dryRun: boolean;
}

export const USAGE = [
  'Usage: bun run scaffold <kind> <name> [options]',
  '  module <plural-name> [--variant=standalone|header-detail|record] [--singular=<name>]',
  '         header-detail: [--detail=<plural>] [--detail-singular=<name>]   (default detail: items)',
  '  module <plural-name> --parent=<parent-module> [--one] [--parent-singular=<name>] [--singular=<name>]',
  '         dependent of an existing module: 1:N, or 1:1 with --one (at most one live row per parent);',
  '         created as <parent-singular>-<name> (documents under orders → order-documents, table order_documents)',
  '  partner <plural-name> [--singular=<name>]',
  '  webhook <plural-name> --vendor=<vendor> [--singular=<name>] [--institution="<name>"]',
  '  integration <vendor> [--institution="<name>"]',
  '  --dry-run   print the plan, write nothing',
].join('\n');

const KINDS: readonly ScaffoldKind[] = ['module', 'partner', 'webhook', 'integration'];
const OPTIONS = [
  'variant',
  'singular',
  'vendor',
  'institution',
  'detail',
  'detail-singular',
  'parent',
  'parent-singular',
] as const;

/** Parses `<kind> <name> [--option=value] [--dry-run]`; unknown options are errors. */
export const parseScaffoldArgs = (argv: readonly string[]): ParsedArgs => {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const kind = positional.at(0);
  const name = positional.at(1);
  if (kind === undefined || name === undefined || positional.length > 2)
    throw new ScaffoldError(USAGE);
  if (!KINDS.some((known) => known === kind))
    throw new ScaffoldError(`unknown kind "${kind}"\n${USAGE}`);

  const options = new Map<string, string>();
  let dryRun = false;
  let one = false;
  for (const flag of flags) {
    if (flag === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (flag === '--one') {
      one = true;
      continue;
    }
    const match = /^--([a-z]+(?:-[a-z]+)*)=(.+)$/.exec(flag);
    const key = match?.at(1) ?? '';
    if (!OPTIONS.some((option) => option === key))
      throw new ScaffoldError(`unknown option ${flag}\n${USAGE}`);
    options.set(key, match?.at(2) ?? '');
  }

  const variant = options.get('variant');
  if (
    variant !== undefined &&
    (kind !== 'module' || !MODULE_VARIANTS.some((known) => known === variant))
  ) {
    throw new ScaffoldError(`--variant is ${MODULE_VARIANTS.join(' | ')} and only for "module"`);
  }
  const vendor = options.get('vendor');
  if (vendor !== undefined && kind !== 'webhook')
    throw new ScaffoldError('--vendor is only for "webhook"');
  const detail = options.get('detail');
  if (detail !== undefined && variant !== 'header-detail') {
    throw new ScaffoldError('--detail is only for "module … --variant=header-detail"');
  }
  if (options.has('detail-singular') && detail === undefined) {
    throw new ScaffoldError('--detail-singular needs --detail=<plural>');
  }
  const parent = options.get('parent');
  if (parent !== undefined && (kind !== 'module' || (variant ?? 'standalone') !== 'standalone')) {
    throw new ScaffoldError(
      '--parent is only for "module" without --variant: a dependent module is its own table kind',
    );
  }
  if (one && parent === undefined) throw new ScaffoldError('--one needs --parent=<parent-module>');
  if (options.has('parent-singular') && parent === undefined) {
    throw new ScaffoldError('--parent-singular needs --parent=<parent-module>');
  }
  if (options.has('singular') && kind === 'integration') {
    throw new ScaffoldError('an integration is named after its vendor (singular): no --singular');
  }

  return {
    request: {
      kind: kind as ScaffoldKind,
      name,
      variant: variant as ModuleVariant | undefined,
      singular: options.get('singular'),
      vendor,
      institution: options.get('institution'),
      detail,
      detailSingular: options.get('detail-singular'),
      parent,
      parentSingular: options.get('parent-singular'),
      one: one || undefined,
    },
    dryRun,
  };
};
