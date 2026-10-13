/**
 * Verifies the scaffold-module templates — and the `bun run scaffold` CLI that applies them —
 * against the real quality gates.
 *
 * Usage: bun run verify:scaffold
 *
 * Runs the CLI (scripts/scaffold.ts) for every variant — standalone, header-detail, record,
 * dependent (1:N and 1:1, attached afterwards to the standalone probe, whose files must stay
 * byte-identical), partner, webhook — and for an outbound vendor adapter, exactly as a developer
 * would; then runs
 * prettier --check, tsc, eslint, ls-lint, dependency-cruiser, knip, the generated tests and the
 * schema conventions, plus live requests through `createApp()`. Everything the CLI created or
 * edited is restored afterwards — also on failure or Ctrl+C.
 *
 * Why: the templates are documentation, so no other gate compiles them. The standalone template
 * drifted from the code three times before this check existed (see the adoption plan log).
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  APP_PATH,
  APPEND_ONLY_PATH,
  CONFIG_BARREL,
  planScaffold,
  REGISTRY_PATH,
  SCHEMA_BARREL,
  STRUCTURE_PATH,
  type ScaffoldRequest,
} from './lib/scaffold';

interface Variant {
  label: string;
  request: ScaffoldRequest;
  /** `[path, method]` that must be described with describeEndpoint(), relative to the base path. */
  documented: [string, string][];
  /** A request that must be rejected with 400 by validate() once authenticated. */
  invalid: { path: string; method: string; body?: string };
  /** Inbound channel: users with access tokens (default), partners or vendor webhooks. */
  channel?: 'partner' | 'webhook';
}

/** Kebab-case names with a hyphen on purpose: exercises naming rules for multi-word modules. */
const VARIANTS: Variant[] = [
  {
    label: 'standalone',
    request: { kind: 'module', name: 'scaffold-probes' },
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
    request: { kind: 'module', name: 'probe-orders', variant: 'header-detail' },
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
    // A named, multi-word detail: every spelling of it (route, table, wire key, methods) is derived.
    label: 'header-detail --detail',
    request: {
      kind: 'module',
      name: 'probe-classes',
      variant: 'header-detail',
      detail: 'line-members',
    },
    documented: [
      ['/v1/probe-classes', 'post'],
      ['/v1/probe-classes/{id}/line-members', 'get'],
      ['/v1/probe-classes/{id}/line-members', 'put'],
      ['/v1/probe-classes/{id}/line-members/{childId}', 'patch'],
      ['/v1/probe-classes/{id}/line-members/{childId}', 'delete'],
    ],
    invalid: {
      path: '/v1/probe-classes/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/line-members',
      method: 'PUT',
      body: '{"line_members":[{"description":"","quantity":0}]}',
    },
  },
  {
    label: 'record',
    request: { kind: 'module', name: 'probe-events', variant: 'record' },
    documented: [
      ['/v1/probe-events', 'post'],
      ['/v1/probe-events', 'get'],
    ],
    invalid: { path: '/v1/probe-events?per_page=1000', method: 'GET' },
  },
  {
    // Attached to the standalone probe above, generated earlier in the same run (incremental).
    label: 'dependent (1:N)',
    request: { kind: 'module', name: 'probe-notes', parent: 'scaffold-probes' },
    documented: [
      ['/v1/scaffold-probes/{scaffoldProbeId}/probe-notes', 'post'],
      ['/v1/scaffold-probes/{scaffoldProbeId}/probe-notes', 'get'],
      ['/v1/probe-notes/{id}', 'get'],
      ['/v1/probe-notes/{id}', 'patch'],
      ['/v1/probe-notes/{id}', 'delete'],
      ['/v1/probe-notes/{id}/restore', 'post'],
    ],
    invalid: {
      path: '/v1/scaffold-probes/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/probe-notes',
      method: 'POST',
      body: '{}',
    },
  },
  {
    label: 'dependent (1:1)',
    request: { kind: 'module', name: 'probe-profiles', parent: 'scaffold-probes', one: true },
    documented: [
      ['/v1/scaffold-probes/{scaffoldProbeId}/probe-profile', 'get'],
      ['/v1/scaffold-probes/{scaffoldProbeId}/probe-profile', 'put'],
      ['/v1/scaffold-probes/{scaffoldProbeId}/probe-profile', 'delete'],
      ['/v1/probe-profiles/{id}', 'get'],
      ['/v1/probe-profiles/{id}/restore', 'post'],
    ],
    invalid: {
      path: '/v1/scaffold-probes/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/probe-profile',
      method: 'PUT',
      body: '{}',
    },
  },
  {
    label: 'partner',
    request: { kind: 'partner', name: 'probe-submissions' },
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
    request: { kind: 'webhook', name: 'probe-receipts', vendor: 'probe-hooks' },
    documented: [['/webhooks/probe-hooks', 'post']],
    invalid: {
      path: '/webhooks/probe-hooks',
      method: 'POST',
      body: '{"id":"","type":"thing.happened","data":{}}',
    },
    channel: 'webhook',
  },
];

/** Login-based vendor adapter (references/integration.md). */
const INTEGRATION: ScaffoldRequest = { kind: 'integration', name: 'probe-vendor' };

/** The CLI command line for a request — what a developer would type. */
const cliArgs = (request: ScaffoldRequest): string[] => [
  request.kind,
  request.name,
  ...(request.variant ? [`--variant=${request.variant}`] : []),
  ...(request.vendor ? [`--vendor=${request.vendor}`] : []),
  ...(request.detail ? [`--detail=${request.detail}`] : []),
  ...(request.parent ? [`--parent=${request.parent}`] : []),
  ...(request.one ? ['--one'] : []),
];

/** The parent probe of the dependent variants: attaching children must not change a byte of it. */
const PARENT_PROBE = 'scaffold-probes';
const parentProbeFiles = (): Map<string, string> => {
  const folder = `src/modules/${PARENT_PROBE}`;
  // The parent's own files; its dependents are subfolders (src/modules/<parent>/<child>/) on purpose.
  const paths = [
    `src/database/schema/domain/${PARENT_PROBE}.schema.ts`,
    ...(existsSync(folder)
      ? readdirSync(folder, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => `${folder}/${entry.name}`)
      : []),
  ];
  return new Map(paths.map((path) => [path, readFileSync(path, 'utf-8')]));
};
let parentSnapshot = new Map<string, string>();

/** Runs the CLI for every request in order; snapshots the parent probe right after it is created. */
const runCli = (): boolean =>
  requests.every((request) => {
    const ok = run(`bun run scaffold ${cliArgs(request).join(' ')}`, [
      'bun',
      'scripts/scaffold.ts',
      ...cliArgs(request),
    ]);
    if (ok && request.name === PARENT_PROBE) parentSnapshot = parentProbeFiles();
    return ok;
  });

const parentUntouched = (): boolean => {
  const now = parentProbeFiles();
  const changed = [...parentSnapshot.keys()].filter(
    (path) => now.get(path) !== parentSnapshot.get(path),
  );
  const added = [...now.keys()].filter((path) => !parentSnapshot.has(path));
  const ok = parentSnapshot.size > 0 && changed.length === 0 && added.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  dependent modules leave their parent module untouched`);
  if (!ok) {
    console.log(
      [
        ...changed.map((path) => `  changed: ${path}`),
        ...added.map((path) => `  added: ${path}`),
      ].join('\n'),
    );
  }
  return ok;
};

const requests = [...VARIANTS.map((variant) => variant.request), INTEGRATION];
/** Every file the CLI creates, from the same plan it applies. */
const plannedFiles = requests.flatMap((request) =>
  planScaffold(request).files.map((file) => file.path),
);
/** Shared files the CLI edits: restored byte for byte afterwards. */
const SHARED = [APP_PATH, SCHEMA_BARREL, APPEND_ONLY_PATH, REGISTRY_PATH, CONFIG_BARREL];
/** Also edited (the module tree), restored, but not code: no prettier / ESLint. */
const SHARED_DOCS = [STRUCTURE_PATH];
const originals = new Map(
  [...SHARED, ...SHARED_DOCS].map((path) => [path, readFileSync(path, 'utf-8')]),
);
let cleanedUp = false;

/** Folders created only for the probes (`src/modules/<probe>`, `src/integrations/<probe>`). */
const probeFolders = [
  ...new Set(
    plannedFiles
      .map((path) => dirname(path))
      .filter((dir) => /^src\/(modules|integrations)\/[^/]+$/.test(dir)),
  ),
];

const cleanup = (): void => {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const path of plannedFiles) rmSync(path, { force: true });
  for (const dir of probeFolders) rmSync(dir, { recursive: true, force: true });
  for (const [path, content] of originals) writeFileSync(path, content);
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
  const existing = [...plannedFiles, ...probeFolders].filter((path) => existsSync(path));
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
    // The CLI exactly as documented; it formats what it writes (Prettier), so --check must pass.
    ok =
      runCli() &&
      parentUntouched() &&
      run('prettier --check (the CLI formatted what it wrote)', [
        'bunx',
        'prettier',
        '--check',
        ...plannedFiles,
        ...SHARED,
      ]) &&
      run('tsc --noEmit', ['bunx', 'tsc', '--noEmit']) &&
      run('eslint', ['bunx', 'eslint', '--max-warnings', '0', ...plannedFiles, ...SHARED]) &&
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
        ...plannedFiles.filter((path) => path.endsWith('.test.ts')).map((path) => `./${path}`),
        // The generated tables are exported from the schema barrel: they must pass the conventions.
        './src/database/schema/schema-conventions.test.ts',
        // File names, module/vendor naming and channel mounting (partner routers under /partner).
        './test/structure.test.ts',
        // The CLI lists each new module in the canonical tree (docs/standards/structure.md).
        './test/docs-sync.test.ts',
      ]) &&
      // Hermetic like the test suite: no local env file values, no real database or Redis.
      run('live requests through createApp()', [
        'bun',
        '--preload',
        './test/setup/hermetic-env.ts',
        '-e',
        liveCheck(),
      ]) &&
      // What a developer runs right after scaffolding: the whole suite (default-deny, OpenAPI and
      // docs guards see the generated routes) and the coverage gate, so every generated source
      // file must be loaded by a generated test and reach the per-file threshold.
      run('bun run test:cov (whole suite + coverage gate, generated modules included)', [
        'bun',
        'run',
        'test:cov',
      ]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    ok = false;
  } finally {
    cleanup();
  }

  console.log(
    ok
      ? 'SUCCESS: `bun run scaffold` and every scaffold-module template pass every gate.'
      : 'FAILURE: a scaffold-module template (or the scaffold CLI) is out of sync with the codebase.',
  );
  process.exit(ok ? 0 : 1);
};

main();
