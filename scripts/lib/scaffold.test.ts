import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import {
  APP_MARKERS,
  APP_PATH,
  APPEND_ONLY_PATH,
  CONFIG_BARREL,
  deriveAdapterNames,
  deriveNames,
  deriveVendorNames,
  fill,
  materialize,
  parseScaffoldArgs,
  planScaffold,
  REGISTRY_PATH,
  replaceAnchor,
  SCHEMA_BARREL,
  ScaffoldError,
  STRUCTURE_PATH,
  type ScaffoldPlan,
  pluralGuess,
  singularOf,
  titleOf,
} from './scaffold';

const ROOT = resolve(import.meta.dir, '../..');

/** The registration surface of src/app.ts, as the CLI sees it. */
const appFixture = (vendors = ''): string =>
  [
    "import { userRoutes } from './modules/users/users.routes';",
    APP_MARKERS.imports,
    `export const WEBHOOK_VENDORS: readonly WebhookVendor[] = [${vendors}];`,
    '  app.use(`${webhooksPath}/*`, requireVerifiedWebhook());',
    APP_MARKERS.webhookRoutes,
    "  v1.route('/users', userRoutes);",
    APP_MARKERS.v1Routes,
    '  app.route(v1Path, v1);',
    '',
  ].join('\n');

const FIXTURES = new Map([
  [APP_PATH, appFixture()],
  [SCHEMA_BARREL, "export * from './users.schema';\n"],
  [
    APPEND_ONLY_PATH,
    "export const APPEND_ONLY_TABLES: Readonly<Record<string, string>> = {\n  record_changes: 'audit',\n};\n",
  ],
  [
    REGISTRY_PATH,
    "export const INTEGRATION_REGISTRY = {\n  JSONPLACEHOLDER: { code: 'JSONPLACEHOLDER', institution: 'JSONPlaceholder' },\n} as const;\n",
  ],
  [CONFIG_BARREL, "export * from './app.config';\n"],
  [
    STRUCTURE_PATH,
    '│   ├── health/                  # Health\n│   └── users/                   # Reference standalone-table module\n',
  ],
]);

/** Applies a plan's edits to the fixtures, like the CLI does to the real files. */
const applied = (plan: ScaffoldPlan, fixtures = FIXTURES): Map<string, string> => {
  const result = new Map<string, string>();
  for (const edit of plan.edits) {
    result.set(edit.path, edit.apply(result.get(edit.path) ?? fixtures.get(edit.path) ?? ''));
  }
  return result;
};

const errorOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof ScaffoldError ? error.message : `not a ScaffoldError: ${String(error)}`;
  }
  return 'no error';
};

describe('singularOf', () => {
  it.each([
    ['products', 'product'],
    ['categories', 'category'],
    ['boxes', 'box'],
    ['addresses', 'address'],
    ['batches', 'batch'],
    ['wishes', 'wish'],
    ['statuses', 'status'],
    ['days', 'day'],
    ['flight-schedules', 'flight-schedule'],
    ['order-categories', 'order-category'],
  ])('%s → %s', (plural, singular) => {
    expect(singularOf(plural)).toBe(singular);
  });

  it.each(['status', 'analysis', 'address', 'people', 'data'])(
    'refuses "%s" (looks singular or irregular): --singular is required',
    (name) => {
      expect(errorOf(() => singularOf(name))).toContain('--singular=<name>');
    },
  );

  it('explains the refusal and suggests the plural', () => {
    const notPlural = errorOf(() => singularOf('product'));
    expect(notPlural).toContain('"product" does not look plural (it does not end in -s)');
    expect(notPlural).toContain('Did you mean "products"?');
    expect(errorOf(() => singularOf('status'))).toContain(
      '"status" looks singular (it ends in -us). Module names are plural',
    );
    expect(errorOf(() => singularOf('status'))).toContain('Did you mean "statuses"?');
  });
});

describe('pluralGuess', () => {
  it.each([
    ['product', 'products'],
    ['category', 'categories'],
    ['day', 'days'],
    ['status', 'statuses'],
    ['box', 'boxes'],
    ['batch', 'batches'],
    ['order-item', 'order-items'],
  ])('%s → %s', (singular, plural) => {
    expect(pluralGuess(singular)).toBe(plural);
  });
});

describe('names', () => {
  it('derives every spelling the templates use', () => {
    expect(deriveNames('flight-schedules')).toEqual({
      name: 'flight-schedules',
      snakePlural: 'flight_schedules',
      snakeSingular: 'flight_schedule',
      upperSingular: 'FLIGHT_SCHEDULE',
      pascalPlural: 'FlightSchedules',
      camelPlural: 'flightSchedules',
      pascalSingular: 'FlightSchedule',
      camelSingular: 'flightSchedule',
    });
  });

  it('takes an explicit singular for irregular plurals', () => {
    expect(deriveNames('people', 'person').camelSingular).toBe('person');
  });

  it('refuses a singular equal to the name, and names that are not kebab-case', () => {
    expect(errorOf(() => deriveNames('news', 'news'))).toContain('must differ');
    expect(errorOf(() => deriveNames('Products'))).toContain('name must be kebab-case');
    expect(errorOf(() => deriveNames('products', 'Product'))).toContain(
      '--singular must be kebab-case',
    );
    expect(errorOf(() => deriveNames('order--items'))).toContain('kebab-case');
  });

  it('names an adapter and a vendor in singular forms only', () => {
    expect(deriveAdapterNames('acme-pay')).toMatchObject({
      name: 'acme-pay',
      upperSingular: 'ACME_PAY',
      pascalSingular: 'AcmePay',
      camelSingular: 'acmePay',
    });
    expect(deriveVendorNames('acme-pay')).toEqual({
      kebab: 'acme-pay',
      upper: 'ACME_PAY',
      camel: 'acmePay',
      pascal: 'AcmePay',
    });
    expect(errorOf(() => deriveVendorNames('Acme'))).toContain('--vendor must be kebab-case');
    expect(errorOf(() => deriveAdapterNames('acme_pay'))).toContain('vendor must be kebab-case');
    expect(titleOf('acme-pay')).toBe('Acme Pay');
  });
});

describe('fill and materialize', () => {
  const names = deriveNames('products');
  const vendor = deriveVendorNames('acme-pay');

  it('fills every placeholder, leaves vendor placeholders without a vendor, keeps `$` literal', () => {
    const text =
      '<name> <snake_plural> <snake_singular> <UPPER_SINGULAR> <PascalPlural> <camelPlural> <PascalSingular> <camelSingular> `${base}` $&';
    expect(fill(text, names)).toBe(
      'products products product PRODUCT Products products Product product `${base}` $&',
    );
    expect(fill('<vendor> <VENDOR> <vendorCamel> <VendorPascal>', names)).toBe(
      '<vendor> <VENDOR> <vendorCamel> <VendorPascal>',
    );
    expect(fill('<vendor> <VENDOR> <vendorCamel> <VendorPascal>', names, vendor)).toBe(
      'acme-pay ACME_PAY acmePay AcmePay',
    );
  });

  it('writes the code block under each `### Step N: … (src/…)` heading, skipping registrations', () => {
    const template = [
      '### Step 1: Schema (`src/database/schema/domain/<name>.schema.ts`)',
      '```typescript',
      'export const <camelPlural> = 1;',
      '```',
      '### Step 2: Register (`src/app.ts`)',
      '```typescript',
      'v1.route();',
      '```',
      '### Step 3: Notes',
      '```typescript',
      'not a file',
      '```',
    ].join('\r\n');
    expect(materialize(template, names, [APP_PATH])).toEqual([
      {
        path: 'src/database/schema/domain/products.schema.ts',
        content: 'export const products = 1;\n',
      },
    ]);
    expect(errorOf(() => materialize('# nothing here', names, []))).toContain(
      'no template code blocks',
    );
  });
});

describe('replaceAnchor', () => {
  it('replaces a string or the first regex match, passing the groups', () => {
    expect(replaceAnchor('a MARK b MARK', 'MARK', (found) => `[${found}]`)).toBe('a [MARK] b MARK');
    expect(
      replaceAnchor(
        'list = [x]',
        /(list = \[)([^\]]*)\]/,
        (_m, head = '', items = '') => `${head}${items}, y]`,
      ),
    ).toBe('list = [x, y]');
  });

  it('fails loudly when the anchor is missing (never a silent registration gap)', () => {
    expect(errorOf(() => replaceAnchor('content', 'MARK', () => ''))).toContain(
      'anchor not found: MARK',
    );
  });
});

describe('planScaffold (against the real templates)', () => {
  it('module (standalone): files, schema barrel, route above the markers', () => {
    const plan = planScaffold({ kind: 'module', name: 'products' }, ROOT);
    expect(plan.label).toBe('standalone module products (singular product)');
    expect(
      planScaffold({ kind: 'module', name: 'audit-events', variant: 'record' }, ROOT).label,
    ).toBe('record module audit-events (singular audit-event)');
    expect(plan.files.map((file) => file.path)).toContain(
      'src/modules/products/products.routes.ts',
    );
    expect(plan.files.map((file) => file.path)).toContain(
      'src/database/schema/domain/products.schema.ts',
    );
    const edits = applied(plan);
    expect(edits.get(SCHEMA_BARREL)).toBe(
      "export * from './users.schema';\nexport * from './products.schema';\n",
    );
    expect(edits.get(APP_PATH)).toContain(
      `import { productsRouter } from './modules/products/products.routes';\n${APP_MARKERS.imports}`,
    );
    expect(edits.get(APP_PATH)).toContain(
      `  v1.route('/products', productsRouter);\n${APP_MARKERS.v1Routes}`,
    );
    expect(edits.has(APPEND_ONLY_PATH)).toBe(false);
    expect(edits.get(STRUCTURE_PATH)).toBe(
      '│   ├── health/                  # Health\n│   ├── products/                # Standalone-table module (/api/v1/products)\n│   └── users/                   # Reference standalone-table module\n',
    );
    expect(plan.nextSteps.join('\n')).toContain('bun run db:generate');
  });

  it('module (record): also an APPEND_ONLY_TABLES entry and a reminder to state its reason', () => {
    const plan = planScaffold({ kind: 'module', name: 'audit-events', variant: 'record' }, ROOT);
    expect(applied(plan).get(APPEND_ONLY_PATH)).toContain('  audit_events: ');
    expect(plan.nextSteps.join('\n')).toContain('Write the reason of audit_events');
  });

  it('a long module name keeps a space before the comment in the tree', () => {
    const plan = planScaffold({ kind: 'module', name: 'very-long-reconciliation-batches' }, ROOT);
    expect(applied(plan).get(STRUCTURE_PATH)).toContain(
      '│   ├── very-long-reconciliation-batches/ # Standalone-table module',
    );
  });

  it('header-detail: the detail defaults to items (order_items, /orders/:id/items)', () => {
    const plan = planScaffold({ kind: 'module', name: 'orders', variant: 'header-detail' }, ROOT);
    const schema = plan.files.find((file) => file.path.endsWith('.schema.ts'))?.content ?? '';

    expect(plan.label).toBe(
      'header-detail module orders (singular order; detail items (singular item), table order_items)',
    );
    expect(schema).toContain("export const orderItems = appTable(\n  'order_items',");
    expect(applied(plan).get(STRUCTURE_PATH)).toContain('(/api/v1/orders[/:id/items])');
  });

  it('header-detail --detail: every spelling of the detail is derived from its plural name', () => {
    const plan = planScaffold(
      { kind: 'module', name: 'invoices', variant: 'header-detail', detail: 'line-items' },
      ROOT,
    );
    const content = (suffix: string): string =>
      plan.files.find((file) => file.path.endsWith(suffix))?.content ?? '';

    expect(plan.label).toContain(
      'detail line-items (singular line-item), table invoice_line_items',
    );
    expect(content('.schema.ts')).toContain(
      "export const invoiceLineItems = appTable(\n  'invoice_line_items',",
    );
    expect(content('.schema.ts')).toContain("index('invoice_line_items_invoice_idx')");
    expect(content('.repository.ts')).toContain(
      'export class InvoiceLineItemsRepository extends ChildRepository',
    );
    expect(content('.routes.ts')).toContain("'/:id/line-items/:childId'");
    expect(content('.service.ts')).toContain('async syncLineItems(');
    expect(content('.messages.ts')).toContain('LINE_ITEM_CREATED');
    // The sync body is snake_case on the wire, camelCase in the DTO.
    expect(content('.dto.ts')).toContain('lineItems: z.array(');
    expect(content('.controller.test.ts')).toContain("send('PUT', { line_items: [");
    expect(applied(plan).get(STRUCTURE_PATH)).toContain('(/api/v1/invoices[/:id/line-items])');
  });

  it('header-detail --detail: no "item" is left in the generated code (the default name is fully replaced)', () => {
    const plan = planScaffold(
      { kind: 'module', name: 'classes', variant: 'header-detail', detail: 'members' },
      ROOT,
    );
    // Pagination (`totalItems`, `paginatedItem`, `total_items`) and Indonesian "ditemukan" are not the detail.
    const leftovers = plan.files.flatMap((file) =>
      file.content
        .split('\n')
        .filter((line) =>
          /item/i.test(line.replace(/totalItems|paginatedItem|total_items|ditemukan/g, '')),
        )
        .map((line) => `${file.path}: ${line.trim()}`),
    );
    expect(leftovers).toEqual([]);
  });

  it('header-detail --detail: irregular plurals take --detail-singular; a non-plural detail is refused with the command to run', () => {
    expect(
      planScaffold(
        {
          kind: 'module',
          name: 'teams',
          variant: 'header-detail',
          detail: 'people',
          detailSingular: 'person',
        },
        ROOT,
      ).label,
    ).toContain('detail people (singular person), table team_people');
    expect(
      errorOf(() =>
        planScaffold(
          { kind: 'module', name: 'classes', variant: 'header-detail', detail: 'member' },
          ROOT,
        ),
      ),
    ).toContain('→  bun run scaffold module classes --variant=header-detail --detail=members');
    expect(
      errorOf(() =>
        planScaffold(
          {
            kind: 'module',
            name: 'classes',
            variant: 'header-detail',
            detail: 'members',
            detailSingular: 'members',
          },
          ROOT,
        ),
      ),
    ).toContain("the detail's singular must differ");
    expect(
      errorOf(() =>
        planScaffold(
          { kind: 'module', name: 'classes', variant: 'header-detail', detail: 'Members' },
          ROOT,
        ),
      ),
    ).toContain('--detail must be kebab-case');
  });

  it('module (header-detail): the header-detail template', () => {
    const plan = planScaffold({ kind: 'module', name: 'invoices', variant: 'header-detail' }, ROOT);
    expect(plan.template).toEndWith('references/header-detail.md');
  });

  it('partner: mounted under /partner, with the allowed_routes reminder', () => {
    const plan = planScaffold({ kind: 'partner', name: 'submissions' }, ROOT);
    expect(plan.files.map((file) => file.path)).toContain(
      'src/modules/submissions/submissions.partner.routes.ts',
    );
    expect(applied(plan).get(APP_PATH)).toContain(
      "  v1.route('/partner/submissions', submissionsPartnerRoutes);",
    );
    expect(plan.nextSteps.join('\n')).toContain('allowed_routes');
  });

  it('webhook: verifier + receiver, appended to WEBHOOK_VENDORS (empty or not), config, registry', () => {
    const plan = planScaffold(
      { kind: 'webhook', name: 'payment-receipts', vendor: 'acme-pay' },
      ROOT,
    );
    expect(plan.files.map((file) => file.path)).toContain(
      'src/integrations/acme-pay/acme-pay.webhook.ts',
    );
    const edits = applied(plan);
    expect(edits.get(APP_PATH)).toContain('readonly WebhookVendor[] = [acmePayWebhook];');
    expect(edits.get(APP_PATH)).toContain(
      `  app.route(\`\${webhooksPath}/\${acmePayWebhook.vendor}\`, paymentReceiptsWebhookRoutes);\n${APP_MARKERS.webhookRoutes}`,
    );
    expect(edits.get(CONFIG_BARREL)).toContain("export * from './acme-pay.config';");
    expect(edits.get(REGISTRY_PATH)).toContain(
      "  ACME_PAY: { code: 'ACME_PAY', institution: 'Acme Pay' },",
    );
    expect(edits.get(STRUCTURE_PATH)).toContain(
      '│   ├── payment-receipts/        # Vendor webhook receiver (POST /api/webhooks/acme-pay, idempotent)\n',
    );
    expect(plan.nextSteps.join('\n')).toContain(
      'ACME_PAY_WEBHOOK_SECRET, ACME_PAY_WEBHOOK_TOLERANCE_SECONDS',
    );
    const withExisting = applied(
      plan,
      new Map([...FIXTURES, [APP_PATH, appFixture('demoPayWebhook')]]),
    );
    expect(withExisting.get(APP_PATH)).toContain('= [demoPayWebhook, acmePayWebhook];');
  });

  it('webhook: needs a vendor, and the module is never named after it (plan D26)', () => {
    expect(errorOf(() => planScaffold({ kind: 'webhook', name: 'payments' }, ROOT))).toContain(
      '--vendor',
    );
    expect(
      errorOf(() =>
        planScaffold({ kind: 'webhook', name: 'acme-pays', vendor: 'acme-pays' }, ROOT),
      ),
    ).toContain('D26');
  });

  it('integration: adapter files, registry entry (custom institution, quotes escaped), config barrel', () => {
    const plan = planScaffold(
      { kind: 'integration', name: 'acme-pay', institution: "Acme's Pay" },
      ROOT,
    );
    expect(plan.files.map((file) => file.path)).toEqual([
      'src/config/acme-pay.config.ts',
      'src/integrations/acme-pay/acme-pay.dto.ts',
      'src/integrations/acme-pay/acme-pay.service.ts',
      'src/integrations/acme-pay/index.ts',
      'src/integrations/acme-pay/acme-pay.service.test.ts',
    ]);
    const edits = applied(plan);
    expect(edits.get(REGISTRY_PATH)).toContain(
      "  ACME_PAY: { code: 'ACME_PAY', institution: 'Acme\\'s Pay' },",
    );
    expect(edits.get(CONFIG_BARREL)).toBe(
      "export * from './app.config';\nexport * from './acme-pay.config';\n",
    );
    expect(plan.nextSteps.join('\n')).toContain('ACME_PAY_BASE_URL');
  });

  it('a refused name is answered with the full command to run instead (kind and options kept)', () => {
    expect(errorOf(() => planScaffold({ kind: 'module', name: 'product' }, ROOT))).toContain(
      '→  bun run scaffold module products',
    );
    expect(
      errorOf(() =>
        planScaffold({ kind: 'module', name: 'category', variant: 'header-detail' }, ROOT),
      ),
    ).toContain('→  bun run scaffold module categories --variant=header-detail');
    expect(
      errorOf(() => planScaffold({ kind: 'webhook', name: 'payment', vendor: 'acme-pay' }, ROOT)),
    ).toContain('→  bun run scaffold webhook payments --vendor=acme-pay');
    expect(
      errorOf(() => planScaffold({ kind: 'module', name: 'product', singular: 'product' }, ROOT)),
    ).toContain('did you mean "products"?  →  bun run scaffold module products');
  });

  it('a missing marker in src/app.ts fails the plan instead of skipping the registration', () => {
    const plan = planScaffold({ kind: 'module', name: 'products' }, ROOT);
    const withoutMarker = new Map([
      ...FIXTURES,
      [APP_PATH, appFixture().replace(APP_MARKERS.v1Routes, '')],
    ]);
    expect(errorOf(() => applied(plan, withoutMarker))).toContain('anchor not found');
  });
});

describe('planScaffold — dependent modules (--parent, plan D33)', () => {
  const content = (plan: ScaffoldPlan, suffix: string): string =>
    plan.files.find((file) => file.path.endsWith(suffix))?.content ?? '';

  /** The tree with a parent module line (and one dependent of it already). */
  const withParentInTree = new Map([
    ...FIXTURES,
    [
      STRUCTURE_PATH,
      [
        '│   ├── applications/            # Standalone-table module',
        '│   │   ├── contacts/            # Dependent 1:1',
        '│   ├── health/                  # Health',
        '│   └── users/                   # Reference standalone-table module',
        '',
      ].join('\n'),
    ],
  ]);

  it('1:N: a subfolder of the parent, parent reference + index, shallow-nested routes; no parent file edited', () => {
    const plan = planScaffold({ kind: 'module', name: 'members', parent: 'applications' }, ROOT);

    expect(plan.label).toBe(
      'dependent module members in src/modules/applications/members/ (singular member; 1:N, /applications/:applicationId/members)',
    );
    expect(plan.template).toEndWith('references/dependent.md');
    expect(plan.parent?.segment).toBe('members');
    expect(
      plan.files.every(
        (file) =>
          file.path.startsWith('src/modules/applications/members/members.') ||
          file.path === 'src/database/schema/domain/members.schema.ts',
      ),
    ).toBe(true);
    expect(content(plan, '.controller.ts')).toContain("from '../../../core/middlewares';");
    expect(content(plan, '.repository.test.ts')).toContain(
      "from '../../../../test/helpers/sql-recorder';",
    );
    expect(content(plan, '.schema.ts')).toContain(
      "applicationId: parentReference('application_id', () => applications.id)",
    );
    expect(content(plan, '.schema.ts')).toContain("from './applications.schema';");
    expect(content(plan, '.schema.ts')).toContain("index('members_application_idx')");
    expect(content(plan, '.repository.ts')).toContain(
      'super(members, applications, members.applicationId, txHost);',
    );

    const edits = applied(plan, withParentInTree);
    expect([...edits.keys()].sort()).toEqual([APP_PATH, SCHEMA_BARREL, STRUCTURE_PATH].sort());
    expect(edits.get(APP_PATH)).toContain(
      "import { membersParentRouter, membersRouter } from './modules/applications/members/members.routes';",
    );
    expect(edits.get(APP_PATH)).toContain(
      `  v1.route('/applications/:applicationId/members', membersParentRouter);\n  v1.route('/members', membersRouter);\n${APP_MARKERS.v1Routes}`,
    );
    // Under its parent, after the parent's other dependents.
    expect(edits.get(STRUCTURE_PATH)).toContain(
      [
        '│   │   ├── contacts/            # Dependent 1:1',
        '│   │   ├── members/             # Dependent 1:N (/api/v1/applications/:applicationId/members, /api/v1/members/:id)',
        '│   ├── health/',
      ].join('\n'),
    );
    // A parent drawn last in the tree (└──) gets the matching indentation; a parent missing from it fails.
    const underUsers = applied(
      planScaffold({ kind: 'module', name: 'notes', parent: 'users' }, ROOT),
    ).get(STRUCTURE_PATH);
    expect(underUsers).toContain(
      '│   └── users/                   # Reference standalone-table module\n│       ├── notes/  ',
    );
    expect(errorOf(() => applied(plan))).toContain('anchor not found');
    expect(plan.nextSteps.join('\n')).toContain('parentScope()');
  });

  it('1:1 (--one): the section in the singular under its parent, one live row per parent', () => {
    const plan = planScaffold(
      {
        kind: 'module',
        name: 'contact-people',
        singular: 'contact-person',
        parent: 'applications',
        one: true,
      },
      ROOT,
    );

    expect(plan.label).toContain('1:1, /applications/:applicationId/contact-person)');
    expect(plan.template).toEndWith('references/dependent-one.md');
    expect(content(plan, '.schema.ts')).toContain(
      "activeUniqueIndex('contact_people_application_unique', [table.applicationId], table.deletedAt)",
    );
    expect(content(plan, '.controller.test.ts')).toContain(
      '`/applications/${parentId}/contact-person`',
    );
    expect(applied(plan, withParentInTree).get(APP_PATH)).toContain(
      "v1.route('/applications/:applicationId/contact-person', contactPeopleParentRouter);",
    );
  });

  it('every placeholder is filled (no <…> token of the templates is left)', () => {
    for (const one of [false, true]) {
      const plan = planScaffold(
        { kind: 'module', name: 'line-notes', parent: 'purchase-orders', one },
        ROOT,
      );
      // Every placeholder the module templates use (generics such as `<Note>` are code, not tokens).
      const placeholder =
        /<(?:name|name-singular|snake_plural|snake_singular|UPPER_SINGULAR|PascalPlural|PascalSingular|camelPlural|camelSingular|parent-name|parentCamelPlural|parent_snake_plural|parentCamelSingular|ParentPascalSingular|parent_snake_singular)>/g;
      const leftovers = plan.files.flatMap((file) =>
        [...file.content.matchAll(placeholder)].map((match) => `${file.path}: ${match.at(0)}`),
      );
      expect(plan.files.length).toBeGreaterThan(10);
      expect(leftovers).toEqual([]);
    }
  });

  it('fill leaves the parent placeholders alone without a parent', () => {
    const names = deriveNames('products');
    expect(fill('<parent-name> <parentCamelSingular> <name-singular>', names)).toBe(
      '<parent-name> <parentCamelSingular> product',
    );
    expect(
      fill(
        '<parent-name> <parentCamelPlural> <parent_snake_plural> <parentCamelSingular> <ParentPascalSingular> <parent_snake_singular>',
        names,
        undefined,
        undefined,
        deriveNames('purchase-orders'),
      ),
    ).toBe(
      'purchase-orders purchaseOrders purchase_orders purchaseOrder PurchaseOrder purchase_order',
    );
  });

  it('refuses a module as its own parent, and answers a non-plural parent with the command to run', () => {
    expect(
      errorOf(() => planScaffold({ kind: 'module', name: 'notes', parent: 'notes' }, ROOT)),
    ).toContain('cannot be its own parent');
    const error = errorOf(() =>
      planScaffold({ kind: 'module', name: 'notes', parent: 'project', one: true }, ROOT),
    );
    expect(error).toContain('→  bun run scaffold module notes --parent=projects --one');
    expect(error).toContain('--parent-singular=<name>');
    expect(
      planScaffold(
        { kind: 'module', name: 'notes', parent: 'people', parentSingular: 'person' },
        ROOT,
      ).label,
    ).toContain('/people/:personId/notes');
  });
});

describe('parseScaffoldArgs', () => {
  it('parses kind, name, options and --dry-run', () => {
    expect(
      parseScaffoldArgs([
        'module',
        'products',
        '--variant=record',
        '--singular=product',
        '--dry-run',
      ]),
    ).toEqual({
      request: {
        kind: 'module',
        name: 'products',
        variant: 'record',
        singular: 'product',
        vendor: undefined,
        institution: undefined,
      },
      dryRun: true,
    });
    expect(
      parseScaffoldArgs(['webhook', 'receipts', '--vendor=acme-pay', '--institution=Acme Pay'])
        .request,
    ).toMatchObject({
      kind: 'webhook',
      vendor: 'acme-pay',
      institution: 'Acme Pay',
    });
  });

  it('parses --parent, --parent-singular and the --one flag', () => {
    expect(
      parseScaffoldArgs(['module', 'notes', '--parent=people', '--parent-singular=person', '--one'])
        .request,
    ).toMatchObject({
      kind: 'module',
      name: 'notes',
      parent: 'people',
      parentSingular: 'person',
      one: true,
    });
    expect(parseScaffoldArgs(['module', 'notes', '--parent=projects']).request.one).toBeUndefined();
  });

  it.each([
    [[], 'Usage'],
    [['module', 'notes', '--one'], '--one needs --parent'],
    [['module', 'notes', '--parent-singular=person'], '--parent-singular needs --parent'],
    [
      ['module', 'notes', '--variant=record', '--parent=projects'],
      '--parent is only for "module" without --variant',
    ],
    [['partner', 'notes', '--parent=projects'], '--parent is only for'],
    [['module'], 'Usage'],
    [['module', 'a', 'b'], 'Usage'],
    [['table', 'products'], 'unknown kind "table"'],
    [['module', 'products', '--force'], 'unknown option --force'],
    [['module', 'products', '--variant=webhook'], '--variant is'],
    [['partner', 'products', '--variant=record'], '--variant is'],
    [['module', 'products', '--vendor=acme'], '--vendor is only for "webhook"'],
    [['integration', 'acme-pay', '--singular=acme'], 'no --singular'],
    [
      ['module', 'classes', '--detail=members'],
      '--detail is only for "module … --variant=header-detail"',
    ],
    [['partner', 'classes', '--detail=members'], '--detail is only for'],
    [
      ['module', 'classes', '--variant=header-detail', '--detail-singular=member'],
      '--detail-singular needs --detail',
    ],
  ])('refuses %j', (argv, message) => {
    expect(errorOf(() => parseScaffoldArgs(argv))).toContain(message);
  });
});
