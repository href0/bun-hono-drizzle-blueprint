/**
 * Verifies the scaffold-module skill templates against the real quality gates.
 *
 * Usage: bun run verify:scaffold
 *
 * Materializes every code block of each template variant (`SKILL.md` = standalone,
 * `references/header-detail.md`, `references/record.md`, `references/partner.md`,
 * `references/webhook.md`) as a probe module, and the outbound
 * integration template (`references/integration.md`) as a probe vendor adapter; registers them
 * exactly as the templates instruct, then runs prettier, tsc, eslint, ls-lint, dependency-cruiser,
 * knip, the generated tests and the schema conventions, plus live requests through `createApp()`.
 * Everything it creates or edits is restored afterwards — also on failure or Ctrl+C.
 *
 * Why: the templates are documentation, so no other gate compiles them. The standalone template
 * drifted from the code three times before this check existed (see the adoption plan log).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SKILL_DIR = '.agents/skills/scaffold-module';
const APP_PATH = 'src/app.ts';
const SCHEMA_BARREL = 'src/database/schema/domain/index.ts';
const APPEND_ONLY_PATH = 'src/database/schema/append-only-tables.ts';
const REGISTRY_PATH = 'src/integrations/registry.ts';
const CONFIG_BARREL = 'src/config/index.ts';

interface Names {
  name: string;
  snakePlural: string;
  snakeSingular: string;
  upperSingular: string;
  pascalPlural: string;
  camelPlural: string;
  pascalSingular: string;
  camelSingular: string;
}

interface Variant {
  label: string;
  template: string;
  names: Names;
  /** `[path, method]` that must be described with describeEndpoint(), relative to the base path. */
  documented: [string, string][];
  /** A request that must be rejected with 400 by validate() once authenticated. */
  invalid: { path: string; method: string; body?: string };
  appendOnly?: boolean;
  /** Inbound channel: users with access tokens (default), partners or vendor webhooks. */
  channel?: 'partner' | 'webhook';
  /** Webhook variant: the vendor whose verifier the template generates. */
  vendor?: VendorNames;
}

interface VendorNames {
  kebab: string;
  upper: string;
  camel: string;
  pascal: string;
}

/** Where the template registers its router (Step "Register Route in src/app.ts"). */
const routerOf = (variant: Variant): { file: string; symbol: string; mount: string } =>
  variant.channel === 'webhook'
    ? {
        file: `${variant.names.name}.webhook.routes`,
        symbol: `${variant.names.camelPlural}WebhookRoutes`,
        mount: `/${variant.vendor?.kebab ?? ''}`,
      }
    : variant.channel === 'partner'
      ? {
          file: `${variant.names.name}.partner.routes`,
          symbol: `${variant.names.camelPlural}PartnerRoutes`,
          mount: `/partner/${variant.names.name}`,
        }
      : {
          file: `${variant.names.name}.routes`,
          symbol: `${variant.names.camelPlural}Router`,
          mount: `/${variant.names.name}`,
        };

/** Kebab-case names with a hyphen on purpose: exercises naming rules for multi-word modules. */
const VARIANTS: Variant[] = [
  {
    label: 'standalone',
    template: `${SKILL_DIR}/SKILL.md`,
    names: {
      name: 'scaffold-probes',
      snakePlural: 'scaffold_probes',
      snakeSingular: 'scaffold_probe',
      upperSingular: 'SCAFFOLD_PROBE',
      pascalPlural: 'ScaffoldProbes',
      camelPlural: 'scaffoldProbes',
      pascalSingular: 'ScaffoldProbe',
      camelSingular: 'scaffoldProbe',
    },
    documented: [
      ['/v1/scaffold-probes', 'post'],
      ['/v1/scaffold-probes', 'get'],
      ['/v1/scaffold-probes/{id}', 'get'],
      ['/v1/scaffold-probes/{id}', 'patch'],
      ['/v1/scaffold-probes/{id}', 'delete'],
      ['/v1/scaffold-probes/{id}/restore', 'post'],
    ],
    invalid: { path: '/v1/scaffold-probes/not-a-uuid', method: 'GET' },
  },
  {
    label: 'header-detail',
    template: `${SKILL_DIR}/references/header-detail.md`,
    names: {
      name: 'probe-orders',
      snakePlural: 'probe_orders',
      snakeSingular: 'probe_order',
      upperSingular: 'PROBE_ORDER',
      pascalPlural: 'ProbeOrders',
      camelPlural: 'probeOrders',
      pascalSingular: 'ProbeOrder',
      camelSingular: 'probeOrder',
    },
    documented: [
      ['/v1/probe-orders', 'post'],
      ['/v1/probe-orders/{id}', 'patch'],
      ['/v1/probe-orders/{id}/restore', 'post'],
      ['/v1/probe-orders/{id}/items', 'get'],
      ['/v1/probe-orders/{id}/items', 'post'],
      ['/v1/probe-orders/{id}/items', 'put'],
      ['/v1/probe-orders/{id}/items/{childId}', 'patch'],
      ['/v1/probe-orders/{id}/items/{childId}', 'delete'],
    ],
    invalid: {
      path: '/v1/probe-orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/items/not-a-uuid',
      method: 'DELETE',
    },
  },
  {
    label: 'record',
    template: `${SKILL_DIR}/references/record.md`,
    names: {
      name: 'probe-events',
      snakePlural: 'probe_events',
      snakeSingular: 'probe_event',
      upperSingular: 'PROBE_EVENT',
      pascalPlural: 'ProbeEvents',
      camelPlural: 'probeEvents',
      pascalSingular: 'ProbeEvent',
      camelSingular: 'probeEvent',
    },
    documented: [
      ['/v1/probe-events', 'post'],
      ['/v1/probe-events', 'get'],
    ],
    invalid: { path: '/v1/probe-events?per_page=1000', method: 'GET' },
    appendOnly: true,
  },
  {
    label: 'partner',
    template: `${SKILL_DIR}/references/partner.md`,
    names: {
      name: 'probe-submissions',
      snakePlural: 'probe_submissions',
      snakeSingular: 'probe_submission',
      upperSingular: 'PROBE_SUBMISSION',
      pascalPlural: 'ProbeSubmissions',
      camelPlural: 'probeSubmissions',
      pascalSingular: 'ProbeSubmission',
      camelSingular: 'probeSubmission',
    },
    documented: [
      ['/v1/partner/probe-submissions', 'post'],
      ['/v1/partner/probe-submissions/{reference}', 'get'],
    ],
    invalid: {
      path: '/v1/partner/probe-submissions',
      method: 'POST',
      body: '{"partner_reference":"not a valid reference!","description":"x"}',
    },
    channel: 'partner',
  },
  {
    label: 'webhook',
    template: `${SKILL_DIR}/references/webhook.md`,
    names: {
      name: 'probe-receipts',
      snakePlural: 'probe_receipts',
      snakeSingular: 'probe_receipt',
      upperSingular: 'PROBE_RECEIPT',
      pascalPlural: 'ProbeReceipts',
      camelPlural: 'probeReceipts',
      pascalSingular: 'ProbeReceipt',
      camelSingular: 'probeReceipt',
    },
    vendor: {
      kebab: 'probe-hooks',
      upper: 'PROBE_HOOKS',
      camel: 'probeHooks',
      pascal: 'ProbeHooks',
    },
    documented: [['/webhooks/probe-hooks', 'post']],
    invalid: {
      path: '/webhooks/probe-hooks',
      method: 'POST',
      body: '{"id":"","type":"thing.happened","data":{}}',
    },
    channel: 'webhook',
  },
];

const fill = (text: string, names: Names, vendor?: VendorNames): string =>
  (
    [
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
  ).reduce((result, [pattern, value]) => result.replace(pattern, value), text);

/** Login-based vendor adapter (references/integration.md): only the singular names are used. */
const INTEGRATION = {
  label: 'integration',
  template: `${SKILL_DIR}/references/integration.md`,
  names: {
    name: 'probe-vendor',
    snakePlural: 'probe_vendors',
    snakeSingular: 'probe_vendor',
    upperSingular: 'PROBE_VENDOR',
    pascalPlural: 'ProbeVendors',
    camelPlural: 'probeVendors',
    pascalSingular: 'ProbeVendor',
    camelSingular: 'probeVendor',
  } satisfies Names,
};
const integrationDir = `src/integrations/${INTEGRATION.names.name}`;
const integrationConfig = `src/config/${INTEGRATION.names.name}.config.ts`;

const moduleDir = (names: Names): string => `src/modules/${names.name}`;
const schemaFile = (names: Names): string => `src/database/schema/domain/${names.name}.schema.ts`;

const webhookVendors = (): VendorNames[] =>
  VARIANTS.flatMap((variant) => (variant.vendor ? [variant.vendor] : []));

const originals = new Map<string, string>();
let cleanedUp = false;

const cleanup = (): void => {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const { names } of VARIANTS) {
    rmSync(moduleDir(names), { recursive: true, force: true });
    rmSync(schemaFile(names), { force: true });
  }
  rmSync(integrationDir, { recursive: true, force: true });
  rmSync(integrationConfig, { force: true });
  for (const vendor of webhookVendors()) {
    rmSync(`src/integrations/${vendor.kebab}`, { recursive: true, force: true });
    rmSync(`src/config/${vendor.kebab}.config.ts`, { force: true });
  }
  for (const [path, content] of originals) writeFileSync(path, content);
};

const editFile = (path: string, edit: (content: string) => string): void => {
  const content = readFileSync(path, 'utf-8');
  if (!originals.has(path)) originals.set(path, content);
  const next = edit(content);
  if (next === content) throw new Error(`template registration did not change ${path}`);
  writeFileSync(path, next);
};

const run = (label: string, command: string[]): boolean => {
  const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' });
  const ok = result.exitCode === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(result.stdout.toString().trim());
    console.log(result.stderr.toString().trim());
  }
  return ok;
};

/** Writes the code block under every `### Step N: … (path)` heading, except registration edits. */
const materialize = (
  templatePath: string,
  names: Names,
  registrations: string[],
  vendor?: VendorNames,
): string[] => {
  const template = readFileSync(templatePath, 'utf-8');
  const stepPattern = /### Step \d+: [^\n]*\(`(src\/[^`]+)`\)[\s\S]*?```typescript\n([\s\S]*?)```/g;
  const generated: string[] = [];

  for (const match of template.matchAll(stepPattern)) {
    const path = fill(match[1], names, vendor);
    if (registrations.includes(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, fill(match[2], names, vendor));
    generated.push(path);
  }
  if (generated.length === 0) throw new Error(`no templates found in ${templatePath}`);
  return generated;
};

const generateIntegration = (): string[] => {
  const { names } = INTEGRATION;
  const generated = materialize(INTEGRATION.template, names, [REGISTRY_PATH, CONFIG_BARREL]);
  editFile(REGISTRY_PATH, (content) =>
    content.replace(
      /(export const INTEGRATION_REGISTRY = \{\n)/,
      `$1  ${names.upperSingular}: { code: '${names.upperSingular}', institution: 'Probe Vendor (verify:scaffold)' },\n`,
    ),
  );
  editFile(CONFIG_BARREL, (content) => `${content}export * from './${names.name}.config';\n`);
  return generated;
};

const generate = (variant: Variant): string[] => {
  const { names, vendor } = variant;
  const generated = materialize(variant.template, names, [APP_PATH], vendor);

  if (vendor) {
    // Webhook variant: no table of its own (webhook_events is shared); vendor config + registry.
    editFile(CONFIG_BARREL, (content) => `${content}export * from './${vendor.kebab}.config';\n`);
    editFile(REGISTRY_PATH, (content) =>
      content.replace(
        /(export const INTEGRATION_REGISTRY = \{\n)/,
        `$1  ${vendor.upper}: { code: '${vendor.upper}', institution: 'Probe Hooks (verify:scaffold)' },\n`,
      ),
    );
    const router = routerOf(variant);
    editFile(APP_PATH, (content) =>
      content
        .replace(
          "import { userRoutes } from './modules/users/users.routes';",
          `import { userRoutes } from './modules/users/users.routes';\nimport { ${router.symbol} } from './modules/${names.name}/${router.file}';\nimport { ${vendor.camel}Webhook } from './integrations/${vendor.kebab}/${vendor.kebab}.webhook';`,
        )
        .replace('[demoPayWebhook]', `[demoPayWebhook, ${vendor.camel}Webhook]`)
        .replace(
          '  app.route(`${webhooksPath}/demo-pay`, paymentNotificationWebhookRoutes);',
          `  app.route(\`\${webhooksPath}/demo-pay\`, paymentNotificationWebhookRoutes);\n  app.route(\`\${webhooksPath}${router.mount}\`, ${router.symbol});`,
        ),
    );
    return generated;
  }

  editFile(SCHEMA_BARREL, (content) => `${content}export * from './${names.name}.schema';\n`);
  if (variant.appendOnly) {
    editFile(APPEND_ONLY_PATH, (content) =>
      content.replace(
        /(export const APPEND_ONLY_TABLES[^{]*\{\n)/,
        `$1  ${names.snakePlural}: 'scaffold probe (verify:scaffold)',\n`,
      ),
    );
  }
  const router = routerOf(variant);
  editFile(APP_PATH, (content) =>
    content
      .replace(
        "import { userRoutes } from './modules/users/users.routes';",
        `import { userRoutes } from './modules/users/users.routes';\nimport { ${router.symbol} } from './modules/${names.name}/${router.file}';`,
      )
      .replace(
        "  v1.route('/users', userRoutes);",
        `  v1.route('/users', userRoutes);\n  v1.route('${router.mount}', ${router.symbol});`,
      ),
  );
  return generated;
};

const liveCheck = (): string => `
// Webhook probes are enabled with a test-only secret before the app (and its config) load.
process.env.PROBE_HOOKS_WEBHOOK_SECRET = 'verify-scaffold-webhook-secret';
const { signProbeHooksWebhook } = await import('./src/integrations/probe-hooks/probe-hooks.webhook.ts');
const { createApp } = await import('./src/app.ts');
const { appConfig } = await import('./src/config/index.ts');
const { signAccessToken } = await import('./src/core/security/jwt.ts');
const app = createApp();
const base = appConfig.API_BASE_PATH;
const variants = ${JSON.stringify(VARIANTS.map(({ label, documented, invalid, channel }) => ({ label, documented, invalid, channel })))};
const doc = await (await app.request(base + '/docs/openapi.json')).json();
// Generated routes are protected (default-deny): without a token they must answer 401 ...
const { token } = await signAccessToken({ userId: '0192f1d0-0000-7000-8000-00000000a11c', role: 'admin' });
// Partner routes need a signed request: a probe credential behind the real partnerAuth() lookup.
const { partnerCredentialsService } = await import('./src/modules/partner-credentials/partner-credentials.service.ts');
const { hashPartnerApiKey, partnerSecretCipher } = await import('./src/core/security/partner-credentials.ts');
const { partnerSignatureHeaders } = await import('./src/utils/partner-signature.util.ts');
const probeKey = 'pk_verify_scaffold_probe';
const probeSecret = 'verify-scaffold-probe-secret';
partnerCredentialsService.findForGateway = async (hash) => hash === hashPartnerApiKey(probeKey)
  ? { partnerCode: 'scaffold-probe', encryptedSecret: partnerSecretCipher.encrypt(probeSecret), ipWhitelist: [], allowedRoutes: ['/*'], rateLimitRpm: 1000, isActive: true }
  : null;
let nonce = 0;
for (const variant of variants) {
  const { path, method, body: requestBody } = variant.invalid;
  const anonymous = await app.request(base + path, { method, body: requestBody });
  const anonymousCode = (await anonymous.json()).error?.code;
  const expectedCode = variant.channel === 'partner' ? 'ERR_PARTNER_HEADERS_MISSING' : variant.channel === 'webhook' ? 'ERR_WEBHOOK_SIGNATURE_INVALID' : 'ERR_UNAUTHORIZED';
  if (anonymous.status !== 401 || anonymousCode !== expectedCode) {
    console.error(variant.label + ': expected 401 ' + expectedCode + ' without credentials (default-deny), got', anonymous.status, anonymousCode);
    process.exit(1);
  }
  // ... and validate their input once authenticated (access token or partner signature).
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const credentials = variant.channel === 'webhook'
    ? { 'x-probe-hooks-timestamp': webhookTimestamp, 'x-probe-hooks-signature': signProbeHooksWebhook('verify-scaffold-webhook-secret', webhookTimestamp, requestBody ?? '') }
    : variant.channel === 'partner'
    ? partnerSignatureHeaders({ apiKey: probeKey, secret: probeSecret, method, url: base + path, body: requestBody ?? '', timestamp: String(Date.now()), nonce: 'verify_scaffold_' + String(++nonce).padStart(8, '0') })
    : { Authorization: 'Bearer ' + token };
  const res = await app.request(base + path, { method, body: requestBody, headers: { 'Accept-Language': 'en', 'Content-Type': 'application/json', ...credentials } });
  const body = await res.json();
  if (res.status !== 400 || body.error?.code !== 'ERR_INVALID_INPUT') {
    console.error(variant.label + ': expected 400 ERR_INVALID_INPUT, got', res.status, JSON.stringify(body));
    process.exit(1);
  }
  // Present with a summary and a 2xx response = described by describeEndpoint(), not only by validate().
  const missing = variant.documented.filter(([path, method]) => {
    const op = doc.paths?.[base + path]?.[method];
    return !(op?.summary && Object.keys(op.responses ?? {}).some((status) => status.startsWith('2')));
  });
  if (missing.length > 0) {
    console.error(variant.label + ': not described with describeEndpoint():', JSON.stringify(missing));
    process.exit(1);
  }
}`;

const main = (): void => {
  const existing = [
    ...VARIANTS.flatMap(({ names }) => [moduleDir(names), schemaFile(names)]),
    integrationDir,
    integrationConfig,
    ...webhookVendors().flatMap((vendor) => [
      `src/integrations/${vendor.kebab}`,
      `src/config/${vendor.kebab}.config.ts`,
    ]),
  ].filter((path) => existsSync(path));
  if (existing.length > 0) {
    console.error(`Refusing to run: ${existing.join(', ')} already exist(s).`);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  let ok = false;
  try {
    const generated = VARIANTS.flatMap((variant) => {
      const files = generate(variant);
      console.log(
        `Generated ${String(files.length)} files from ${variant.template} (${variant.label})`,
      );
      return files;
    });
    const integrationFiles = generateIntegration();
    console.log(
      `Generated ${String(integrationFiles.length)} files from ${INTEGRATION.template} (${INTEGRATION.label})`,
    );
    generated.push(...integrationFiles);

    // The templates are formatted for a short name; the skill instructs to format first.
    ok =
      run('prettier --write (as instructed by the skill)', [
        'bunx',
        'prettier',
        '--write',
        ...generated,
      ]) &&
      run('tsc --noEmit', ['bunx', 'tsc', '--noEmit']) &&
      run('eslint', [
        'bunx',
        'eslint',
        '--max-warnings',
        '0',
        ...generated,
        APP_PATH,
        REGISTRY_PATH,
        CONFIG_BARREL,
      ]) &&
      run('ls-lint', ['bunx', 'ls-lint']) &&
      run('dependency-cruiser', [
        'bunx',
        'depcruise',
        'src',
        '--config',
        '.dependency-cruiser.cjs',
      ]) &&
      run('knip', ['bunx', 'knip']) &&
      // The templates' tests must pass, not only compile (hermetic through bunfig.toml).
      run('bun test (generated tests + schema conventions)', [
        'bun',
        'test',
        ...generated.filter((path) => path.endsWith('.test.ts')).map((path) => `./${path}`),
        // The generated tables are exported from the schema barrel: they must pass the conventions.
        './src/database/schema/schema-conventions.test.ts',
        // File names, module/vendor naming and channel mounting (partner routers under /partner).
        './test/structure.test.ts',
      ]) &&
      // Hermetic like the test suite: no local env file values, no real database or Redis.
      run('live requests through createApp()', [
        'bun',
        '--preload',
        './test/setup/hermetic-env.ts',
        '-e',
        liveCheck(),
      ]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    ok = false;
  } finally {
    cleanup();
  }

  console.log(
    ok
      ? 'SUCCESS: every scaffold-module template (modules + integration) passes every gate.'
      : 'FAILURE: a scaffold-module template is out of sync with the codebase.',
  );
  process.exit(ok ? 0 : 1);
};

main();
