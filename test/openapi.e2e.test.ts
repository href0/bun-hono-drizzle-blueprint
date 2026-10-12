import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { appConfig, buildAppConfig } from '../src/config';
import { isPublicRoute } from '../src/core/security/public-routes';
import { isSnakeCaseKey } from '../src/utils/case-converter.util';

interface Operation {
  summary?: string;
  security?: Record<string, string[]>[];
  parameters?: { in: string; name: string }[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}
interface Document {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas?: Record<string, unknown> };
}

const app = createApp();
const docsPath = `${appConfig.API_BASE_PATH}/docs`;

const loadDocument = async (): Promise<Document> => {
  const res = await app.request(`${docsPath}/openapi.json`);
  expect(res.status).toBe(200);
  return (await res.json()) as Document;
};

/** Every property name of every schema in the document, with where it was found. */
const propertyNames = (node: unknown, at = '$'): { name: string; at: string }[] => {
  if (Array.isArray(node))
    return node.flatMap((item, i) => propertyNames(item, `${at}[${String(i)}]`));
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => {
    const own =
      key === 'properties' && typeof value === 'object' && value !== null
        ? Object.keys(value).map((name) => ({ name, at }))
        : [];
    return [...own, ...propertyNames(value, `${at}.${key}`)];
  });
};

describe('OpenAPI document (createApp)', () => {
  it('documents every route of the app except the docs routes themselves', async () => {
    const doc = await loadDocument();
    const routes = new Set(
      app.routes
        .filter((route) => route.method !== 'ALL' && !route.path.startsWith(docsPath))
        .map((route) => `${route.method} ${route.path.replace(/:(\w+)/g, '{$1}')}`),
    );
    const documented = new Set(
      Object.entries(doc.paths).flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
      ),
    );

    // A new route without any OpenAPI metadata fails here.
    expect([...routes].filter((route) => !documented.has(route))).toEqual([]);
    expect(routes.size).toBeGreaterThanOrEqual(7);
  });

  it('has describeEndpoint() on every operation (summary + success response)', async () => {
    // validate() alone also puts a route in the document (request side only), so presence is not
    // enough: summary and a 2xx response come only from describeEndpoint().
    const doc = await loadDocument();
    const incomplete = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(
          ([, op]) =>
            !op.summary || !Object.keys(op.responses).some((status) => status.startsWith('2')),
        )
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );
    expect(incomplete).toEqual([]);
  });

  it('uses snake_case for every schema property and query parameter', async () => {
    const doc = await loadDocument();
    const offending = propertyNames(doc).filter(({ name }) => !isSnakeCaseKey(name));
    const queryNames = Object.values(doc.paths)
      .flatMap((item) => Object.values(item))
      .flatMap((operation) => operation.parameters ?? [])
      .filter((parameter) => parameter.in === 'query' && !isSnakeCaseKey(parameter.name));

    expect(offending).toEqual([]);
    expect(queryNames).toEqual([]);
  });

  it('documents 400 wherever the route validates a body or query/path parameters', async () => {
    const doc = await loadDocument();
    const validates = (op: Operation): boolean =>
      op.requestBody !== undefined ||
      (op.parameters ?? []).some(
        (parameter) => parameter.in === 'query' || parameter.in === 'path',
      );
    const missing = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, op]) => validates(op) && !op.responses['400'])
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );
    expect(missing).toEqual([]);
  });

  it('documents the common headers on every operation and response', async () => {
    const doc = await loadDocument();
    const operations = Object.values(doc.paths).flatMap((item) => Object.values(item));
    for (const op of operations) {
      expect(JSON.stringify(op.parameters)).toContain('#/components/parameters/AcceptLanguage');
      expect(JSON.stringify(op.parameters)).toContain('#/components/parameters/RequestId');
      for (const response of Object.values(op.responses) as {
        headers?: Record<string, unknown>;
      }[]) {
        expect(Object.keys(response.headers ?? {})).toEqual(
          expect.arrayContaining(['X-Request-ID', 'Content-Language']),
        );
      }
    }
  });

  it('marks exactly the operations authenticate() protects with bearerAuth and their 401', async () => {
    const v1 = `${appConfig.API_BASE_PATH}/v1`;
    const wrong = Object.entries((await loadDocument()).paths).flatMap(([path, item]) =>
      Object.entries(item).flatMap(([method, operation]) => {
        const routePath = path.slice(v1.length).replace(/\{(\w+)\}/g, ':$1');
        const protectedRoute =
          path.startsWith(`${v1}/`) && !isPublicRoute(method.toUpperCase(), routePath);
        const documented =
          JSON.stringify(operation.security) === JSON.stringify([{ bearerAuth: [] }]) &&
          '401' in operation.responses;
        const unmarked = operation.security === undefined;
        return (protectedRoute ? documented : unmarked) ? [] : [`${method} ${path}`];
      }),
    );

    expect(wrong).toEqual([]);
  });

  it('serves the reference UI', async () => {
    const res = await app.request(docsPath);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});

describe('API_DOCS_ENABLED', () => {
  it('defaults to on, except in production; an explicit value wins', () => {
    expect(buildAppConfig({ NODE_ENV: 'development' }).API_DOCS_ENABLED).toBe(true);
    expect(buildAppConfig({ NODE_ENV: 'test' }).API_DOCS_ENABLED).toBe(true);
    expect(buildAppConfig({ NODE_ENV: 'production' }).API_DOCS_ENABLED).toBe(false);
    expect(
      buildAppConfig({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' }).API_DOCS_ENABLED,
    ).toBe(true);
    expect(buildAppConfig({ API_DOCS_ENABLED: 'false' }).API_DOCS_ENABLED).toBe(false);
    expect(() => buildAppConfig({ API_DOCS_ENABLED: 'yes' })).toThrow('API_DOCS_ENABLED');
  });
});
