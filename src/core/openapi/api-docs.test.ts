import { I18N_MESSAGES } from '../i18n/messages';
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../middlewares/validate';
import { buildOpenApiDocument, mountApiDocs, SCALAR_BUNDLE_URL } from './api-docs';
import { describeEndpoint } from './describe-endpoint';
import { describeRequest } from './request-spec';
import { isoCalendarDate, isoInstant } from './schemas';
import { createSchema } from 'zod-openapi';
import { Temporal } from 'temporal-polyfill';

const itemSchema = z.object({ itemCode: z.string(), createdAt: isoInstant() });

const buildApp = (): Hono => {
  const app = new Hono();
  app.post(
    '/items/:parentId',
    describeEndpoint({
      tags: ['Items'],
      summary: 'Create',
      response: {
        status: 201,
        description: 'Created',
        message: I18N_MESSAGES.SUCCESS,
        data: itemSchema,
      },
      errors: [409, 400, 429],
    }),
    validate({
      body: z.object({ itemCode: z.string(), note: z.string().optional() }),
      query: z.object({ dryRun: z.coerce.boolean().optional(), sortBy: z.string() }),
      params: z.object({ parentId: z.string().uuid() }),
    }),
    (c) => c.text('ok'),
  );
  app.get(
    '/items',
    describeEndpoint({
      tags: ['Items'],
      summary: 'List',
      description: 'Paginated',
      response: {
        status: 200,
        description: 'Page',
        message: I18N_MESSAGES.SUCCESS,
        paginatedItem: itemSchema,
      },
    }),
    (c) => c.text('ok'),
  );
  app.get('/undocumented', (c) => c.text('ok'));
  return app;
};

const info = { title: 'Test API', version: '1.2.3', description: 'Test description' };

interface JsonContent {
  content: Record<string, { schema: { properties: Record<string, unknown> } }>;
}

describe('buildOpenApiDocument', () => {
  it('documents request (from validate) and responses (from describeEndpoint) in snake_case', async () => {
    const doc = await buildOpenApiDocument(buildApp(), info);
    const post = doc.paths['/items/{parentId}'].post;

    expect(doc.info).toMatchObject(info);
    expect(post?.parameters).toEqual([
      { in: 'query', name: 'dry_run', required: false, schema: { type: 'boolean' } },
      { in: 'query', name: 'sort_by', required: true, schema: { type: 'string' } },
      { in: 'path', name: 'parentId', required: true, schema: { type: 'string', format: 'uuid' } },
      { $ref: '#/components/parameters/AcceptLanguage' },
      { $ref: '#/components/parameters/RequestId' },
    ]);
    expect(post?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: {
            properties: { item_code: { type: 'string' }, note: { type: 'string' } },
            required: ['item_code'],
          },
        },
      },
    });
    // Listed errors are de-duplicated; 429 and 500 always; 400 + 413 come from validate() (body).
    expect(Object.keys(post?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '409',
      '413',
      '429',
      '500',
    ]);
    expect(post?.responses['409']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
    });
  });

  it('wraps list items in the paginated envelope and skips undocumented routes', async () => {
    const doc = await buildOpenApiDocument(buildApp(), info);
    const list = doc.paths['/items'].get;
    const ok = list?.responses['200'] as JsonContent;

    expect(list?.description).toBe('Paginated');
    expect(Object.keys(ok.content['application/json'].schema.properties)).toEqual([
      'success',
      'status_code',
      'message',
      'data',
      'meta',
    ]);
    expect(doc.paths['/undocumented']).toBeUndefined();
    expect(Object.keys(doc.components.schemas ?? {}).sort()).toEqual([
      'ErrorEnvelope',
      'PaginationMeta',
    ]);
    expect(doc.components.securitySchemes).toHaveProperty('bearerAuth');
  });

  it('adds the common headers: X-Request-ID / Content-Language / RateLimit-* out, Retry-After on 429', async () => {
    const doc = await buildOpenApiDocument(buildApp(), info);
    const responses = doc.paths['/items'].get?.responses as Record<
      string,
      { headers: Record<string, unknown> }
    >;

    expect(Object.keys(responses['200'].headers)).toEqual([
      'X-Request-ID',
      'Content-Language',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ]);
    expect(responses['429'].headers).toHaveProperty('Retry-After');
    expect(responses['200'].headers).not.toHaveProperty('Retry-After');
    expect(Object.keys(doc.components.parameters ?? {})).toEqual(['AcceptLanguage', 'RequestId']);
    expect(doc.components.headers).toHaveProperty('RetryAfter');
  });

  it('is stable across calls and apps (no shared generator state)', async () => {
    const first = await buildOpenApiDocument(buildApp(), info);
    const second = await buildOpenApiDocument(buildApp(), info);
    expect(second).toEqual(first);
  });
});

describe('buildOpenApiDocument security rules', () => {
  const documented = (summary: string): ReturnType<typeof describeEndpoint> =>
    describeEndpoint({
      tags: ['Probe'],
      summary,
      response: {
        status: 200,
        description: 'OK',
        message: I18N_MESSAGES.SUCCESS,
        data: z.object({ ok: z.boolean() }),
      },
    });

  it('marks vendor webhook, partner and bearer operations each with its own scheme', async () => {
    const app = new Hono();
    app.post('/api/webhooks/acme', documented('Acme webhook'), (c) => c.text('ok'));
    app.post('/api/webhooks/unlisted', documented('Unlisted vendor'), (c) => c.text('ok'));
    app.get('/api/v1/partner/ping', documented('Partner ping'), (c) => c.text('ok'));
    app.get('/api/v1/users', documented('Users'), (c) => c.text('ok'));
    app.get('/public', documented('Public'), (c) => c.text('ok'));

    const doc = await buildOpenApiDocument(app, info, {
      requiresAuthentication: (_method, path) => path.startsWith('/api/v1/'),
      requiresPartnerSignature: (_method, path) => path.startsWith('/api/v1/partner/'),
      webhooks: {
        pathPrefix: '/api/webhooks',
        vendors: [{ vendor: 'acme', signatureHeader: 'x-acme-signature' }],
      },
    });
    const operation = (path: string, method: string): Record<string, unknown> =>
      new Map(Object.entries(doc.paths[path] as Record<string, Record<string, unknown>>)).get(
        method,
      ) ?? {};

    expect(doc.components.securitySchemes).toMatchObject({
      'acme-webhook': { type: 'apiKey', in: 'header', name: 'x-acme-signature' },
    });
    expect(operation('/api/webhooks/acme', 'post').security).toEqual([{ 'acme-webhook': [] }]);
    expect(Object.keys(operation('/api/webhooks/acme', 'post').responses ?? {})).toContain('401');
    // A path under the prefix whose vendor is not listed gets no webhook scheme.
    expect(operation('/api/webhooks/unlisted', 'post').security).toBeUndefined();
    expect(Object.keys(operation('/api/v1/partner/ping', 'get').responses ?? {})).toEqual(
      expect.arrayContaining(['401', '403']),
    );
    expect(operation('/api/v1/users', 'get').security).toEqual([{ bearerAuth: [] }]);
    expect(operation('/public', 'get').security).toBeUndefined();
  });
});

describe('describeRequest', () => {
  it('describes nothing without schemas, and no parameters for non-object schemas', () => {
    expect(describeRequest({})).toEqual({});
    expect(describeRequest({ query: z.string() })).toEqual({});
  });

  it('documents 400 for validated input and 413 only when there is a body', () => {
    const query = describeRequest({ query: z.object({ page: z.coerce.number() }) });
    const body = describeRequest({ body: z.object({ name: z.string() }) });

    expect(Object.keys(query.responses ?? {})).toEqual(['400']);
    expect(Object.keys(body.responses ?? {})).toEqual(['400', '413']);
  });
});

describe('mountApiDocs', () => {
  it('serves the JSON document and the reference UI when enabled', async () => {
    const app = buildApp();
    mountApiDocs(app, { basePath: '/api', enabled: true, info });

    const json = await app.request('/api/docs/openapi.json');
    expect(json.status).toBe(200);
    expect(((await json.json()) as { info: { title: string } }).info.title).toBe('Test API');

    const ui = await app.request('/api/docs');
    expect(ui.status).toBe(200);
    const html = await ui.text();
    expect(html).toContain('/api/docs/openapi.json');
    // The UI bundle is pinned, never "whatever the CDN serves today".
    expect(html).toContain(SCALAR_BUNDLE_URL);
    expect(SCALAR_BUNDLE_URL).toMatch(/@\d+\.\d+\.\d+$/);
  });

  it('mounts nothing when disabled (production default): both routes are 404', async () => {
    const app = buildApp();
    mountApiDocs(app, { basePath: '/api', enabled: false, info });

    expect((await app.request('/api/docs')).status).toBe(404);
    expect((await app.request('/api/docs/openapi.json')).status).toBe(404);
  });
});

describe('Temporal response schemas', () => {
  it('document instants and calendar dates as ISO strings and accept only Temporal values', () => {
    const schema = z.object({ startsAt: isoInstant(), dueDate: isoCalendarDate() });
    const { schema: json } = createSchema(schema, { schemaType: 'output' });

    expect(json).toMatchObject({
      properties: {
        startsAt: { type: 'string', format: 'date-time' },
        dueDate: { type: 'string', format: 'date' },
      },
    });
    expect(
      schema.safeParse({
        startsAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
        dueDate: Temporal.PlainDate.from('2026-10-05'),
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ startsAt: '2026-10-05T03:00:00Z', dueDate: '2026-10-05' }).success,
    ).toBe(false);
  });
});
