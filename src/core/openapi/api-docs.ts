import { Scalar } from '@scalar/hono-api-reference';
import type { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { toSnakeCaseOpenApi } from '../../utils/openapi-case.util';
import { addCommonHeaders } from './common-headers';
import { errorResponseObject } from './describe-endpoint';

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

/** Vendor webhooks under one prefix (`<base>/webhooks`), each verified by its own signature header. */
export interface WebhookDocs {
  pathPrefix: string;
  vendors: readonly { vendor: string; signatureHeader: string }[];
}

/** How `createApp()` authenticates each operation; the document marks them the same way. */
export interface SecurityRules {
  requiresAuthentication?: RequiresAuthentication;
  /** Operations behind `partnerAuth()`: documented with the partner signing headers instead. */
  requiresPartnerSignature?: RequiresAuthentication;
  /** Operations behind a vendor's `webhookAuth()`: documented with that vendor's signature header. */
  webhooks?: WebhookDocs;
}

const webhookSchemeName = (vendor: string): string => `${vendor}-webhook`;

const webhookSecuritySchemes = (webhooks: WebhookDocs | undefined): Record<string, unknown> =>
  Object.fromEntries(
    (webhooks?.vendors ?? []).map(({ vendor, signatureHeader }) => [
      webhookSchemeName(vendor),
      {
        type: 'apiKey',
        in: 'header',
        name: signatureHeader,
        description: `Signature of the ${vendor} webhook, per the vendor's documentation`,
      },
    ]),
  );

/** The vendor of a webhook operation (`<prefix>/<vendor>/…`), if the path is one. */
const webhookVendorOf = (webhooks: WebhookDocs | undefined, path: string): string | undefined => {
  if (!webhooks || !path.startsWith(`${webhooks.pathPrefix}/`)) return undefined;
  const segment = path
    .slice(webhooks.pathPrefix.length + 1)
    .split('/')
    .at(0);
  return webhooks.vendors.find((entry) => entry.vendor === segment)?.vendor;
};

/**
 * Marks every operation that `authenticate()` protects (`bearerAuth` + 401), every one behind
 * `partnerAuth()` (the partner signing headers + 401, 403) and every vendor webhook (the vendor's
 * signature header + 401).
 */
const addSecurity = (document: OpenApiDocument, rules: SecurityRules): OpenApiDocument => {
  const requiresAuthentication = rules.requiresAuthentication ?? ((): boolean => false);
  const requiresPartnerSignature = rules.requiresPartnerSignature ?? ((): boolean => false);
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item as Record<string, SecuredOperation>)) {
      const webhookVendor = webhookVendorOf(rules.webhooks, path);
      if (webhookVendor !== undefined) {
        operation.security = [{ [webhookSchemeName(webhookVendor)]: [] }];
        operation.responses = { ...operation.responses, 401: errorResponseObject(401) };
      } else if (requiresPartnerSignature(method.toUpperCase(), path)) {
        operation.security = [PARTNER_REQUIREMENT];
        operation.responses = {
          ...operation.responses,
          401: errorResponseObject(401),
          403: errorResponseObject(403),
        };
      } else if (requiresAuthentication(method.toUpperCase(), path)) {
        operation.security = [{ bearerAuth: [] }];
        operation.responses = { ...operation.responses, 401: errorResponseObject(401) };
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
  security: SecurityRules = {},
): Promise<OpenApiDocument> => {
  const document = await generateSpecs(app, {
    documentation: {
      info,
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          ...PARTNER_SECURITY_SCHEMES,
          ...webhookSecuritySchemes(security.webhooks),
        },
      },
    },
  });
  return toSnakeCaseOpenApi(addCommonHeaders(addSecurity(document, security)));
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
    security?: SecurityRules;
  },
): void => {
  if (!options.enabled) return;

  const specPath = `${options.basePath}/docs/openapi.json`;
  let document: Promise<OpenApiDocument> | undefined;

  app.get(specPath, async (c) => {
    document ??= buildOpenApiDocument(app, options.info, options.security);
    return c.json(await document);
  });
  app.get(
    `${options.basePath}/docs`,
    Scalar({ url: specPath, pageTitle: options.info.title, cdn: SCALAR_BUNDLE_URL }),
  );
};
