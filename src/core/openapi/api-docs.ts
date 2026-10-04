import { Scalar } from '@scalar/hono-api-reference';
import type { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { toSnakeCaseOpenApi } from '../../utils/openapi-case.util';
import { addCommonHeaders } from './common-headers';

/**
 * The Scalar UI bundle, pinned: unpinned it would load whatever version the CDN serves today.
 * Bump together with `@scalar/hono-api-reference`.
 */
export const SCALAR_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.4';

export interface ApiDocsInfo {
  title: string;
  version: string;
  description: string;
}

export type OpenApiDocument = Awaited<ReturnType<typeof generateSpecs>>;

/**
 * The OpenAPI 3.1 document of every route described with `describeEndpoint()` (request side from
 * `validate()`), with the platform's common headers, in the snake_case wire contract.
 */
export const buildOpenApiDocument = async (
  app: Hono,
  info: ApiDocsInfo,
): Promise<OpenApiDocument> => {
  const document = await generateSpecs(app, {
    documentation: {
      info,
      components: {
        securitySchemes: {
          // Declared for the JWT phase; operations start requiring it with authenticate().
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
  return toSnakeCaseOpenApi(addCommonHeaders(document));
};

/**
 * Mounts `GET <basePath>/docs/openapi.json` and the Scalar reference UI at `GET <basePath>/docs`.
 * Mount it after every other route. Disabled (not mounted, so 404) when `enabled` is false —
 * `API_DOCS_ENABLED`, off by default in production.
 */
export const mountApiDocs = (
  app: Hono,
  options: { basePath: string; enabled: boolean; info: ApiDocsInfo },
): void => {
  if (!options.enabled) return;

  const specPath = `${options.basePath}/docs/openapi.json`;
  let document: Promise<OpenApiDocument> | undefined;

  app.get(specPath, async (c) => {
    document ??= buildOpenApiDocument(app, options.info);
    return c.json(await document);
  });
  app.get(
    `${options.basePath}/docs`,
    Scalar({ url: specPath, pageTitle: options.info.title, cdn: SCALAR_BUNDLE_URL }),
  );
};
