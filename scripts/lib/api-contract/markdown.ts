/**
 * Renders the API contract (the same OpenAPI document as the snapshot) as Indonesian Markdown for
 * integrators (plan D35): `docs/api/README.md` (index, envelopes, every error code, the Platform
 * routes) and one file per module named after its folder — dependent modules in their parent's
 * subfolder (`docs/api/projects/project-tasks.md`). Pure and deterministic: the same document gives the
 * same bytes, which `openapi:check` compares.
 */
// Pure modules only (no configuration): this file is imported before the contract env is set.
import { ERROR_CATALOG } from '../../../src/core/errors/error-catalog';
import type { AppErrorCode } from '../../../src/core/errors/error-codes';
import { camelToSnakeCase } from '../../../src/utils/case-converter.util';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const get = (node: unknown, key: string): unknown =>
  isObject(node) ? new Map(Object.entries(node)).get(key) : undefined;
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);

/** Operations mounted by `src/app.ts` itself (no module): listed under "Platform" in the README. */
const PLATFORM_OPERATIONS = new Set(['GET /']);

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'];
const EXAMPLE_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const EXAMPLE_TIME = '2026-01-01T00:00:00.000Z';

const GENERATED_NOTE =
  '> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).';

interface Operation {
  method: string;
  path: string;
  op: Json;
}

class Renderer {
  constructor(private readonly document: Json) {}

  deref(node: unknown, seen: readonly string[] = []): Json {
    if (!isObject(node)) return {};
    const ref = node.$ref;
    if (typeof ref !== 'string') return node;
    if (seen.includes(ref)) return {};
    let target: unknown = this.document;
    for (const segment of ref.replace(/^#\//, '').split('/')) target = get(target, segment);
    return this.deref(target, [...seen, ref]);
  }

  /** The non-null variant of `X | null`, and whether null is allowed. */
  private unwrap(node: unknown): { schema: Json; nullable: boolean } {
    const schema = this.deref(node);
    const variants = asArray(schema.anyOf ?? schema.oneOf).map((variant) => this.deref(variant));
    if (variants.length > 0) {
      const nonNull = variants.filter((variant) => variant.type !== 'null');
      if (nonNull.length === 1 && nonNull[0]) {
        return { schema: { ...schema, ...nonNull[0] }, nullable: nonNull.length < variants.length };
      }
    }
    const types = asArray(schema.type);
    if (types.includes('null')) {
      const rest = types.filter((type) => type !== 'null');
      return { schema: { ...schema, type: rest.length === 1 ? rest[0] : rest }, nullable: true };
    }
    return { schema, nullable: false };
  }

  typeText(node: unknown): string {
    const { schema, nullable } = this.unwrap(node);
    let text: string;
    if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
      text = asArray(schema.anyOf ?? schema.oneOf)
        .map((variant) => this.typeText(variant))
        .join(' \\| ');
    } else if (schema.type === 'array') {
      text = `array<${this.typeText(schema.items)}>`;
    } else {
      const base = asString(schema.type) || (isObject(schema.properties) ? 'object' : 'any');
      text = schema.format === undefined ? base : `${base} (${asString(schema.format)})`;
    }
    return nullable ? `${text} \\| null` : text;
  }

  rules(node: unknown): string {
    const { schema } = this.unwrap(node);
    const rules: string[] = [];
    if (Array.isArray(schema.enum)) {
      rules.push(`salah satu: ${schema.enum.map((value) => `\`${String(value)}\``).join(', ')}`);
    }
    if (schema.const !== undefined) rules.push(`selalu \`${JSON.stringify(schema.const)}\``);
    const bounds: [string, string][] = [
      ['minLength', 'panjang ≥'],
      ['maxLength', 'panjang ≤'],
      ['minimum', '≥'],
      ['maximum', '≤'],
      ['exclusiveMinimum', '>'],
      ['exclusiveMaximum', '<'],
      ['minItems', 'item ≥'],
      ['maxItems', 'item ≤'],
    ];
    for (const [keyword, label] of bounds) {
      if (typeof schema[keyword] === 'number') rules.push(`${label} ${String(schema[keyword])}`);
    }
    if (typeof schema.pattern === 'string') rules.push(`pola \`${schema.pattern}\``);
    if (schema.default !== undefined) rules.push(`default \`${JSON.stringify(schema.default)}\``);
    const description = asString(schema.description);
    return [...rules, ...(description ? [description] : [])].join('; ').replaceAll('|', '\\|');
  }

  /** One row per field (nested objects as `a.b`, array items as `a[].b`). */
  fieldRows(node: unknown, prefix = ''): string[] {
    const { schema } = this.unwrap(node);
    const rows: string[] = [];
    const properties = isObject(schema.properties) ? schema.properties : undefined;
    if (properties) {
      const required = new Set(asArray(schema.required).map(String));
      for (const name of Object.keys(properties)) {
        const child = properties[name];
        const field = `${prefix}${name}`;
        rows.push(
          `| \`${field}\` | ${this.typeText(child)} | ${required.has(name) ? 'ya' : 'tidak'} | ${this.rules(child)} |`,
        );
        rows.push(...this.nested(child, field));
      }
    }
    return rows;
  }

  private nested(node: unknown, field: string): string[] {
    const { schema } = this.unwrap(node);
    if (isObject(schema.properties)) return this.fieldRows(schema, `${field}.`);
    if (schema.type === 'array') {
      const items = this.unwrap(schema.items).schema;
      if (isObject(items.properties)) return this.fieldRows(items, `${field}[].`);
    }
    return [];
  }

  example(node: unknown, depth = 0): unknown {
    const { schema } = this.unwrap(node);
    if (depth > 8) return null;
    if (schema.example !== undefined) return schema.example;
    const examples = asArray(schema.examples);
    if (examples.length > 0) return examples[0];
    if (schema.const !== undefined) return schema.const;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
    if (Array.isArray(schema.anyOf ?? schema.oneOf)) {
      return this.example(asArray(schema.anyOf ?? schema.oneOf)[0], depth + 1);
    }
    if (schema.default !== undefined) return schema.default;
    if (isObject(schema.properties)) {
      return Object.fromEntries(
        Object.entries(schema.properties).map(([name, child]) => [
          name,
          this.example(child, depth + 1),
        ]),
      );
    }
    switch (schema.type) {
      case 'array':
        return [this.example(schema.items, depth + 1)];
      case 'integer':
      case 'number': {
        const minimum = typeof schema.minimum === 'number' ? schema.minimum : undefined;
        const exclusive =
          typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum + 1 : undefined;
        return minimum ?? exclusive ?? 1;
      }
      case 'boolean':
        return true;
      case 'null':
        return null;
      case 'object':
        return isObject(schema.additionalProperties)
          ? { key: this.example(schema.additionalProperties, depth + 1) }
          : {};
      default:
        return this.stringExample(schema);
    }
  }

  private stringExample(schema: Json): string {
    const byFormat: Record<string, string> = {
      uuid: EXAMPLE_ID,
      'date-time': EXAMPLE_TIME,
      date: '2026-01-01',
      email: 'user@example.com',
      uri: 'https://example.com',
      url: 'https://example.com',
    };
    const formatted = new Map(Object.entries(byFormat)).get(asString(schema.format));
    if (formatted !== undefined) return formatted;
    const minLength = typeof schema.minLength === 'number' ? schema.minLength : 0;
    return minLength > 6 ? 'x'.repeat(minLength) : 'string';
  }
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);
/** Envelope examples are written in camelCase and sent like `ApiResponse` sends them: snake_case. */
const wire = (value: unknown): string => json(camelToSnakeCase(value));
const codeBlock = (language: string, body: string): string => `\`\`\`${language}\n${body}\n\`\`\``;

const operationsOf = (document: Json): Operation[] =>
  Object.keys(isObject(document.paths) ? document.paths : {})
    .sort()
    .flatMap((path) => {
      const item = get(document.paths, path);
      return METHOD_ORDER.filter((method) => isObject(get(item, method))).map((method) => ({
        method,
        path,
        op: get(item, method) as Json,
      }));
    });

const keyOf = ({ method, path }: Operation): string => `${method.toUpperCase()} ${path}`;

/** Path relative to `docs/api/` of a module's file (`users.md`, `projects/project-tasks.md`). */
const fileOf = (module: string): string => `${module}.md`;
/** Link from one file in `docs/api/` to another. */
const linkBetween = (from: string, to: string): string => {
  const depth = from.split('/').length - 1;
  return `${'../'.repeat(depth)}${to}`;
};

class ContractMarkdown {
  private readonly r: Renderer;

  constructor(private readonly document: Json) {
    this.r = new Renderer(document);
  }

  private access(op: Json): string[] {
    const schemes = asArray(op.security).flatMap((requirement) =>
      isObject(requirement) ? Object.keys(requirement) : [],
    );
    const lines: string[] = [];
    if (schemes.length === 0) lines.push('Publik (tanpa autentikasi)');
    else if (schemes.includes('bearerAuth')) {
      lines.push('Access token: `Authorization: Bearer <access_token>`');
    } else if (schemes.some((scheme) => scheme.startsWith('partner'))) {
      lines.push('Tanda tangan partner (header `x-partner-*`, signing v1 — lihat panduan partner)');
    } else {
      for (const scheme of schemes) {
        const header = asString(
          get(get(get(this.document.components, 'securitySchemes'), scheme), 'name'),
        );
        lines.push(`Signature webhook vendor (header \`${header}\`)`);
      }
    }
    const callers = asArray(op['x-allowed-callers']).map(String);
    if (callers.length > 0) {
      const who = callers.map((caller) => {
        if (caller.startsWith('self:'))
          return `pemilik resource (\`${caller.slice(5)}\` = id Anda)`;
        if (caller.startsWith('partner:')) return `partner \`${caller.slice(8)}\``;
        return `role \`${caller}\``;
      });
      lines.push(`Hanya: ${who.join(' atau ')}`);
    }
    return lines;
  }

  private parameterTable(op: Json, location: string, title: string): string[] {
    const parameters = asArray(op.parameters)
      .map((parameter) => this.r.deref(parameter))
      .filter((parameter) => parameter.in === location);
    if (parameters.length === 0) return [];
    return [
      `**${title}**`,
      '',
      '| Nama | Tipe | Wajib | Aturan / keterangan |',
      '|---|---|---|---|',
      ...parameters.map((parameter) => {
        const rules = [
          this.r.rules(parameter.schema),
          asString(parameter.description).replaceAll('|', '\\|'),
        ]
          .filter(Boolean)
          .join('; ');
        return `| \`${asString(parameter.name)}\` | ${this.r.typeText(parameter.schema)} | ${parameter.required === true ? 'ya' : 'tidak'} | ${rules} |`;
      }),
      '',
    ];
  }

  private bodySchema(op: Json): unknown {
    return get(get(get(this.r.deref(op.requestBody), 'content'), 'application/json'), 'schema');
  }

  private requestExample({ method, path, op }: Operation): string {
    const parameters = asArray(op.parameters).map((parameter) => this.r.deref(parameter));
    let url = path;
    for (const parameter of parameters.filter((p) => p.in === 'path')) {
      url = url.replace(`{${asString(parameter.name)}}`, String(this.r.example(parameter.schema)));
    }
    const query = parameters
      .filter((p) => p.in === 'query' && p.required === true)
      .map((p) => `${asString(p.name)}=${String(this.r.example(p.schema))}`);
    const lines = [
      `${method.toUpperCase()} ${url}${query.length > 0 ? `?${query.join('&')}` : ''}`,
    ];
    if (asArray(op.security).some((r) => isObject(r) && 'bearerAuth' in r)) {
      lines.push('Authorization: Bearer <access_token>');
    }
    const body = this.bodySchema(op);
    if (body !== undefined)
      lines.push('Content-Type: application/json', '', json(this.r.example(body)));
    return codeBlock('http', lines.join('\n'));
  }

  private successExample(status: string, response: Json): string {
    const schema = get(get(get(response, 'content'), 'application/json'), 'schema');
    const example = this.r.example(schema);
    const messages = asArray(response['x-success-messages']);
    const message = asString(get(messages[0], 'id'));
    return codeBlock(
      'json',
      isObject(example)
        ? json({
            ...example,
            ...(camelToSnakeCase({ statusCode: Number(status), message }) as Json),
          })
        : json(example),
    );
  }

  private errorExample(status: string, code: AppErrorCode, op: Json): string {
    const entry = ERROR_CATALOG[code];
    const external = entry.type === 'EXTERNAL_SERVICE_ERROR';
    // The example names a real input of this endpoint: the first body field, else the first
    // query / path parameter.
    const bodyProperties = get(this.r.deref(this.bodySchema(op)), 'properties');
    const parameters = asArray(op.parameters)
      .map((parameter) => this.r.deref(parameter))
      .filter((parameter) => parameter.in === 'query' || parameter.in === 'path')
      .map((parameter) => asString(parameter.name));
    const firstField = [
      ...Object.keys(isObject(bodyProperties) ? bodyProperties : {}),
      ...parameters,
    ].at(0);
    const details =
      entry.type === 'VALIDATION_ERROR'
        ? [{ field: firstField ?? 'field', message: 'Required' }]
        : undefined;
    return codeBlock(
      'json',
      wire({
        success: false,
        statusCode: Number(status),
        message: entry.meaning.id,
        error: {
          type: entry.type,
          code,
          origin: external ? '<KODE_INTEGRASI>' : 'APP',
          ...(external ? { institution: '<nama vendor>' } : {}),
          ...(details ? { details } : {}),
        },
        requestId: EXAMPLE_ID,
        timestamp: EXAMPLE_TIME,
      }),
    );
  }

  /** The full section of one operation. */
  endpoint(operation: Operation): string[] {
    const { op } = operation;
    const lines = [`## \`${keyOf(operation)}\``, '', `**${asString(op.summary)}**`, ''];
    const description = asString(op.description);
    if (description) lines.push(description, '');
    lines.push(...this.access(op).map((line) => `- ${line}`), '');

    lines.push(...this.parameterTable(op, 'path', 'Path parameter'));
    lines.push(...this.parameterTable(op, 'query', 'Query'));
    lines.push(...this.parameterTable(op, 'header', 'Header'));
    const body = this.bodySchema(op);
    if (body !== undefined) {
      lines.push(
        '**Body** (`application/json`)',
        '',
        '| Field | Tipe | Wajib | Aturan / keterangan |',
        '|---|---|---|---|',
      );
      lines.push(...this.r.fieldRows(body), '');
    }
    lines.push('**Contoh request**', '', this.requestExample(operation), '');

    const responses = isObject(op.responses) ? op.responses : {};
    const statuses = Object.keys(responses).sort();
    for (const status of statuses.filter((s) => Number(s) < 400)) {
      const response = this.r.deref(responses[status]);
      const messages = asArray(response['x-success-messages']).map(
        (message) =>
          `\`${asString(get(message, 'id'))}\` (en: \`${asString(get(message, 'en'))}\`)`,
      );
      lines.push(`**${status} — ${asString(response.description)}**`, '');
      if (messages.length > 0) lines.push(`Pesan: ${messages.join(' · ')}`, '');
      lines.push(this.successExample(status, response), '');
    }

    const errors = statuses.filter((s) => Number(s) >= 400);
    if (errors.length > 0) {
      lines.push('**Error**', '', '| Status | Code | Arti |', '|---|---|---|');
      for (const status of errors) {
        for (const code of asArray(get(this.r.deref(responses[status]), 'x-error-codes')).map(
          String,
        )) {
          const entry = new Map(Object.entries(ERROR_CATALOG)).get(code);
          lines.push(
            `| ${status} | \`${code}\` | ${(entry?.meaning.id ?? '').replaceAll('|', '\\|')} |`,
          );
        }
      }
      lines.push('');
      for (const status of errors) {
        const first = asArray(get(this.r.deref(responses[status]), 'x-error-codes'))
          .map(String)
          .at(0);
        if (first === undefined) continue;
        lines.push(
          `<details><summary>Contoh ${status}</summary>`,
          '',
          this.errorExample(status, first as AppErrorCode, op),
          '',
          '</details>',
          '',
        );
      }
    }
    return lines;
  }

  moduleFile(module: string, operations: Operation[], children: readonly string[]): string {
    const file = fileOf(module);
    const title = asString(asArray(operations[0]?.op.tags)[0]) || module;
    const parts = module.split('/');
    const lines = [`# ${title} (\`${module}\`)`, '', GENERATED_NOTE, ''];
    const indexLink = linkBetween(file, 'README.md');
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join('/');
      lines.push(
        `[Kontrak API](${indexLink}) › [${parent}](${linkBetween(file, fileOf(parent))}) › ${parts.at(-1) ?? ''}`,
        '',
      );
    } else {
      lines.push(`[Kontrak API](${indexLink}) › ${module}`, '');
    }
    lines.push('| Endpoint | Ringkasan |', '|---|---|');
    for (const operation of operations) {
      lines.push(
        `| \`${keyOf(operation)}\` | ${asString(operation.op.summary).replaceAll('|', '\\|')} |`,
      );
    }
    lines.push('');
    if (children.length > 0) {
      lines.push('**Modul turunan**', '');
      for (const child of children) lines.push(`- [${child}](${linkBetween(file, fileOf(child))})`);
      lines.push('');
    }
    for (const operation of operations) lines.push(...this.endpoint(operation));
    return `${lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`;
  }

  readme(modules: ReadonlyMap<string, Operation[]>, platform: Operation[]): string {
    const lines = [
      '# Kontrak API',
      '',
      GENERATED_NOTE,
      '',
      'Kontrak setiap endpoint: request, response sukses, dan setiap error beserta code-nya. Sumbernya dokumen OpenAPI yang sama dengan snapshot `openapi.json` di folder ini (dan Scalar di `<API_BASE_PATH>/docs` saat aplikasi berjalan).',
      '',
      '## Dasar',
      '',
      '- Base URL: `/api` (`API_BASE_PATH`); versi API ada di path (`/api/v1/...`). Health, docs dan webhook vendor berada di luar `/v1`.',
      '- Nama field request & response **snake_case** (key lain → 400 `ERR_NON_SNAKE_CASE_KEY`); waktu dalam ISO 8601 UTC (`2026-01-01T00:00:00.000Z`).',
      '- Bahasa pesan mengikuti `Accept-Language` (`id` / `en`, default `id`); setiap respons membawa `X-Request-ID`.',
      '- Autentikasi: access token (`Authorization: Bearer`) — [panduan frontend](../auth-guide.md); tanda tangan partner — [panduan partner](../partner-integration-guide.md); webhook vendor diverifikasi signature vendornya.',
      '',
      '## Envelope',
      '',
      'Sukses:',
      '',
      codeBlock(
        'json',
        wire({ success: true, statusCode: 200, message: 'Data berhasil diambil', data: {} }),
      ),
      '',
      'List berhalaman menambah `meta`:',
      '',
      codeBlock(
        'json',
        wire({ meta: { currentPage: 1, perPage: 20, totalItems: 1, totalPages: 1 } }),
      ),
      '',
      'Error:',
      '',
      codeBlock(
        'json',
        wire({
          success: false,
          statusCode: 400,
          message: 'Validasi data gagal',
          error: {
            type: 'VALIDATION_ERROR',
            code: 'ERR_INVALID_INPUT',
            origin: 'APP',
            details: [{ field: 'email', message: 'Invalid email' }],
          },
          requestId: EXAMPLE_ID,
          timestamp: EXAMPLE_TIME,
        }),
      ),
      '',
      '## Modul',
      '',
    ];
    const roots = [...modules.keys()].filter((module) => !module.includes('/')).sort();
    for (const module of roots) {
      const count = modules.get(module)?.length ?? 0;
      lines.push(`- [${module}](${fileOf(module)}) — ${String(count)} endpoint`);
      for (const child of [...modules.keys()].filter((m) => m.startsWith(`${module}/`)).sort()) {
        lines.push(
          `  - [${child.split('/').at(-1) ?? child}](${fileOf(child)}) — ${String(modules.get(child)?.length ?? 0)} endpoint`,
        );
      }
    }
    lines.push(
      '',
      '## Platform',
      '',
      'Route di luar modul (didaftarkan langsung oleh `src/app.ts`).',
      '',
    );
    for (const operation of platform)
      lines.push(...this.endpoint(operation).map((line) => line.replace(/^## /, '### ')));
    lines.push(
      '',
      '## Kode error',
      '',
      '| Code | HTTP | `error.type` | Arti |',
      '|---|---|---|---|',
    );
    for (const [code, entry] of Object.entries(ERROR_CATALOG).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(
        `| \`${code}\` | ${String(entry.status)} | \`${entry.type}\` | ${entry.meaning.id.replaceAll('|', '\\|')} |`,
      );
    }
    return `${lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`;
  }
}

/**
 * Every Markdown file of the contract, keyed by path relative to `docs/api/`. An operation with no
 * known source module that is not a Platform route makes it throw: nothing disappears silently.
 */
export const renderContractMarkdown = (
  document: Json,
  owners: ReadonlyMap<string, string>,
): Map<string, string> => {
  const modules = new Map<string, Operation[]>();
  const platform: Operation[] = [];
  const unknown: string[] = [];
  for (const operation of operationsOf(document)) {
    const key = keyOf(operation);
    const module = owners.get(key);
    if (module !== undefined) modules.set(module, [...(modules.get(module) ?? []), operation]);
    else if (PLATFORM_OPERATIONS.has(key)) platform.push(operation);
    else unknown.push(key);
  }
  if (unknown.length > 0) {
    throw new Error(
      `operations with no source module (not mounted from a src/modules/**/*.routes.ts router): ${unknown.join(', ')}`,
    );
  }

  const markdown = new ContractMarkdown(document);
  const files = new Map<string, string>([['README.md', markdown.readme(modules, platform)]]);
  for (const [module, operations] of [...modules.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const children = [...modules.keys()].filter((m) => m.startsWith(`${module}/`)).sort();
    files.set(fileOf(module), markdown.moduleFile(module, operations, children));
  }
  return files;
};
