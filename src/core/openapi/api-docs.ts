import { Scalar } from '@scalar/hono-api-reference';
import type { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { toSnakeCaseOpenApi } from '../../utils/openapi-case.util';
import { addCommonHeaders } from './common-headers';
import { errorResponse } from './describe-endpoint';

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

/** Whether an operation needs an access token; `path` in OpenAPI form (`/api/v1/users/{id}`). */
export type RequiresAuthentication = (method: string, path: string) => boolean;

interface SecuredOperation {
  security?: unknown[];
  responses?: Record<string, unknown>;
}

/** The four signing headers of a partner request (spec v1), all required together. */
const PARTNER_SECURITY_SCHEMES = {
  partnerKey: { type: 'apiKey', in: 'header', name: 'x-partner-key' },
  partnerTimestamp: {
    type: 'apiKey',
    in: 'header',
    name: 'x-partner-timestamp',
    description: 'Unix epoch milliseconds',
  },
  partnerNonce: {
    type: 'apiKey',
    in: 'header',
    name: 'x-partner-nonce',
    description: '16-64 of [A-Za-z0-9_-], single use',
  },
  partnerSignature: {
    type: 'apiKey',
    in: 'header',
    name: 'x-partner-signature',
    description: 'HMAC-SHA256 hex of the canonical request (signing spec v1)',
  },
} as const;

const PARTNER_REQUIREMENT = Object.fromEntries(
  Object.keys(PARTNER_SECURITY_SCHEMES).map((name) => [name, []]),
);

/**
 * Marks every operation that `authenticate()` protects (`bearerAuth` + 401) and every one behind
 * `partnerAuth()` (the partner signing headers + 401, 403).
 */
const addSecurity = (
  document: OpenApiDocument,
  requiresAuthentication: RequiresAuthentication,
  requiresPartnerSignature: RequiresAuthentication,
): OpenApiDocument => {
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item as Record<string, SecuredOperation>)) {
      if (requiresPartnerSignature(method.toUpperCase(), path)) {
        operation.security = [PARTNER_REQUIREMENT];
        operation.responses = {
          ...operation.responses,
          401: errorResponse(401),
          403: errorResponse(403),
        };
      } else if (requiresAuthentication(method.toUpperCase(), path)) {
        operation.security = [{ bearerAuth: [] }];
        operation.responses = { ...operation.responses, 401: errorResponse(401) };
      }
    }
  }
  return document;
};

/**
 * The OpenAPI 3.1 document of every route described with `describeEndpoint()` (request side from
 * `validate()`), with the platform's common headers, in the snake_case wire contract.
 */
export const buildOpenApiDocument = async (
  app: Hono,
  info: ApiDocsInfo,
  requiresAuthentication: RequiresAuthentication = () => false,
  requiresPartnerSignature: RequiresAuthentication = () => false,
): Promise<OpenApiDocument> => {
  const document = await generateSpecs(app, {
    documentation: {
      info,
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          ...PARTNER_SECURITY_SCHEMES,
        },
      },
    },
  });
  return toSnakeCaseOpenApi(
    addCommonHeaders(addSecurity(document, requiresAuthentication, requiresPartnerSignature)),
  );
};

/**
 * Mounts `GET <basePath>/docs/openapi.json` and the Scalar reference UI at `GET <basePath>/docs`.
 * Mount it after every other route. Disabled (not mounted, so 404) when `enabled` is false —
 * `API_DOCS_ENABLED`, off by default in production.
 */
export const mountApiDocs = (
  app: Hono,
  options: {
    basePath: string;
    enabled: boolean;
    info: ApiDocsInfo;
    requiresAuthentication?: RequiresAuthentication;
    /** Operations behind `partnerAuth()`: documented with the partner signing headers instead. */
    requiresPartnerSignature?: RequiresAuthentication;
  },
): void => {
  if (!options.enabled) return;

  const specPath = `${options.basePath}/docs/openapi.json`;
  let document: Promise<OpenApiDocument> | undefined;

  app.get(specPath, async (c) => {
    document ??= buildOpenApiDocument(
      app,
      options.info,
      options.requiresAuthentication,
      options.requiresPartnerSignature,
    );
    return c.json(await document);
  });
  app.get(
    `${options.basePath}/docs`,
    Scalar({ url: specPath, pageTitle: options.info.title, cdn: SCALAR_BUNDLE_URL }),
  );
};
