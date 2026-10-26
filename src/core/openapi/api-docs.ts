import { Scalar } from '@scalar/hono-api-reference';
import type { Hono } from 'hono';
import { generateSpecs } from 'hono-openapi';
import { toSnakeCaseOpenApi } from '../../utils/openapi-case.util';
import { addCommonHeaders } from './common-headers';
import { APP_ERROR_CODES } from '../errors/error-codes';
import {
  ERROR_CODE_LIST,
  ERROR_CODES_KEY,
  errorCodeEntries,
  errorResponseObject,
  type ErrorSpec,
} from './describe-endpoint';

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
  [ERROR_CODE_LIST]?: string[];
}

/** The codes each authentication mechanism answers with (documented on every operation it guards). */
const BEARER_ERRORS: readonly ErrorSpec[] = [
  {
    status: 401,
    codes: [
      APP_ERROR_CODES.UNAUTHORIZED,
      APP_ERROR_CODES.AUTH_TOKEN_EXPIRED,
      APP_ERROR_CODES.AUTH_TOKEN_INVALID,
    ],
  },
];
// partner:start
const PARTNER_ERRORS: readonly ErrorSpec[] = [
  {
    status: 401,
    codes: [
      APP_ERROR_CODES.PARTNER_HEADERS_MISSING,
      APP_ERROR_CODES.PARTNER_INVALID_KEY,
      APP_ERROR_CODES.PARTNER_REPLAY_REJECTED,
      APP_ERROR_CODES.PARTNER_SIGNATURE_INVALID,
    ],
  },
  {
    status: 403,
    codes: [APP_ERROR_CODES.PARTNER_IP_FORBIDDEN, APP_ERROR_CODES.PARTNER_ROUTE_FORBIDDEN],
  },
];
// partner:end
const WEBHOOK_ERRORS: readonly ErrorSpec[] = [
  { status: 401, codes: [APP_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID] },
];

const addErrorCodes = (operation: SecuredOperation, specs: readonly ErrorSpec[]): void => {
  operation[ERROR_CODE_LIST] = [...(operation[ERROR_CODE_LIST] ?? []), ...errorCodeEntries(specs)];
};

// partner:start
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
// partner:end

/** Vendor webhooks under one prefix (`<base>/webhooks`), each verified by its own signature header. */
export interface WebhookDocs {
  pathPrefix: string;
  vendors: readonly { vendor: string; signatureHeader: string }[];
}

/** How `createApp()` authenticates each operation; the document marks them the same way. */
export interface SecurityRules {
  requiresAuthentication?: RequiresAuthentication;
  // partner:start
  /** Operations behind `partnerAuth()`: documented with the partner signing headers instead. */
  requiresPartnerSignature?: RequiresAuthentication;
  // partner:end
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
 * Marks every operation that `authenticate()` protects (`bearerAuth` + 401) and every vendor
 * webhook (the vendor's signature header + 401).
 */
// partner:start
// Operations behind `partnerAuth()` get the partner signing headers + 401, 403.
// partner:end
const addSecurity = (document: OpenApiDocument, rules: SecurityRules): OpenApiDocument => {
  const requiresAuthentication = rules.requiresAuthentication ?? ((): boolean => false);
  // partner:start
  const requiresPartnerSignature = rules.requiresPartnerSignature ?? ((): boolean => false);
  // partner:end
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item as Record<string, SecuredOperation>)) {
      const webhookVendor = webhookVendorOf(rules.webhooks, path);
      if (webhookVendor !== undefined) {
        operation.security = [{ [webhookSchemeName(webhookVendor)]: [] }];
        operation.responses = { ...operation.responses, 401: errorResponseObject(401) };
        addErrorCodes(operation, WEBHOOK_ERRORS);
        // partner:start
      } else if (requiresPartnerSignature(method.toUpperCase(), path)) {
        operation.security = [PARTNER_REQUIREMENT];
        operation.responses = {
          ...operation.responses,
          401: errorResponseObject(401),
          403: errorResponseObject(403),
        };
        addErrorCodes(operation, PARTNER_ERRORS);
        // partner:end
      } else if (requiresAuthentication(method.toUpperCase(), path)) {
        operation.security = [{ bearerAuth: [] }];
        operation.responses = { ...operation.responses, 401: errorResponseObject(401) };
        addErrorCodes(operation, BEARER_ERRORS);
      }
    }
  }
  return document;
};

/**
 * Turns each operation's `x-error-code-list` (appended by every middleware that documents an
 * error) into `x-error-codes` on the response of that status — sorted, without duplicates.
 */
const groupErrorCodes = (document: OpenApiDocument): OpenApiDocument => {
  for (const item of Object.values(document.paths)) {
    for (const operation of Object.values(item as Record<string, SecuredOperation>)) {
      const byStatus = new Map<string, Set<string>>();
      for (const entry of operation[ERROR_CODE_LIST] ?? []) {
        const [status = '', code = ''] = entry.split(' ');
        byStatus.set(status, new Set([...(byStatus.get(status) ?? []), code]));
      }
      Reflect.deleteProperty(operation, ERROR_CODE_LIST);
      for (const [status, codes] of byStatus) {
        const response = new Map(Object.entries(operation.responses ?? {})).get(status);
        if (typeof response === 'object' && response !== null) {
          Object.assign(response, { [ERROR_CODES_KEY]: [...codes].sort() });
        }
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
          // partner:start
          ...PARTNER_SECURITY_SCHEMES,
          // partner:end
          ...webhookSecuritySchemes(security.webhooks),
        },
      },
    },
  });
  return toSnakeCaseOpenApi(addCommonHeaders(groupErrorCodes(addSecurity(document, security))));
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
