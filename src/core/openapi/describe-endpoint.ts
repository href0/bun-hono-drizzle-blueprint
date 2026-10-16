import type { MiddlewareHandler } from 'hono';
import { describeRoute, resolver, uniqueSymbol, type DescribeRouteOptions } from 'hono-openapi';
import type { z } from 'zod';
import { setEndpointContract, type EndpointContract } from '../context/request-context';
import { APP_ERROR_CODES, type AppErrorCode } from '../errors/error-codes';
import type { LocalizedMessage } from '../i18n/translate';
import { CONTRACT_CHECKS } from './contract-guard';
import { errorEnvelopeSchema, paginatedEnvelope, successEnvelope } from './schemas';

const ERROR_DESCRIPTIONS = {
  400: 'Invalid input or request',
  401: 'Missing or invalid credentials',
  403: 'Authenticated but not allowed',
  404: 'Resource not found',
  409: 'Conflicts with the current state',
  413: 'Request body over HTTP_BODY_LIMIT_BYTES',
  429: 'Rate limit exceeded; retry after the Retry-After header',
  500: 'Unexpected server error (details are never exposed)',
  502: 'An upstream service failed',
  503: 'Service unavailable',
  504: 'An upstream service timed out',
} as const;

export type ErrorStatus = keyof typeof ERROR_DESCRIPTIONS;

/** The codes a status stands for when an endpoint lists it without codes (`errors: [409]`). */
export const DEFAULT_ERROR_CODES: Readonly<Record<ErrorStatus, readonly AppErrorCode[]>> = {
  400: [APP_ERROR_CODES.BAD_REQUEST],
  401: [APP_ERROR_CODES.UNAUTHORIZED],
  403: [APP_ERROR_CODES.FORBIDDEN],
  404: [APP_ERROR_CODES.NOT_FOUND],
  409: [APP_ERROR_CODES.CONFLICT],
  413: [APP_ERROR_CODES.PAYLOAD_TOO_LARGE],
  429: [APP_ERROR_CODES.RATE_LIMITED],
  500: [APP_ERROR_CODES.INTERNAL],
  502: [APP_ERROR_CODES.EXT_ERROR, APP_ERROR_CODES.EXT_UNREACHABLE],
  503: [APP_ERROR_CODES.SERVICE_UNAVAILABLE],
  504: [APP_ERROR_CODES.EXT_TIMEOUT],
};

/** A documented error: a status (its default codes) or a status with the exact codes it sends. */
export type ErrorSpec =
  | ErrorStatus
  | { readonly status: ErrorStatus; readonly codes: readonly [AppErrorCode, ...AppErrorCode[]] };

/**
 * Operation-level list of `"<status> <code>"` entries. Several middlewares document one route and
 * `hono-openapi` overwrites a response status that two of them describe, but concatenates arrays:
 * every source appends here, and `buildOpenApiDocument()` groups the list into `x-error-codes`.
 */
export const ERROR_CODE_LIST = 'x-error-code-list';
/** On each error response: every code it can carry. */
export const ERROR_CODES_KEY = 'x-error-codes';
/** On each success response: the messages (`id` / `en`) it may carry. */
const SUCCESS_MESSAGES_KEY = 'x-success-messages';

/** Possible on every endpoint: the global rate limit and the error handler. */
const ALWAYS_POSSIBLE: readonly ErrorStatus[] = [429, 500];

interface SuccessDoc {
  status: 200 | 201;
  description: string;
  /**
   * The message the controller sends (the same `*_MESSAGES` constant), or every one it may send
   * for this status (e.g. one per health state); checked when testing.
   */
  message: LocalizedMessage | readonly [LocalizedMessage, ...LocalizedMessage[]];
}

const messagesOf = (success: SuccessDoc): readonly LocalizedMessage[] =>
  Array.isArray(success.message) ? success.message : [success.message as LocalizedMessage];

export interface EndpointDoc {
  tags: string[];
  summary: string;
  description?: string;
  /** `data`: wrapped in the success envelope · `paginatedItem`: a page of items + `meta`. */
  response: SuccessDoc & ({ data: z.ZodTypeAny } | { paginatedItem: z.ZodTypeAny });
  /** Another success outcome with the same data (an upsert: 201 created or 200 updated). */
  alsoResponds?: readonly SuccessDoc[];
  /**
   * Domain errors this endpoint can return — `404`, or `{ status: 409, codes: [...] }` for codes
   * other than the status default. Added automatically: 429 and 500 (every route), 400 / 413 by
   * `validate()`, 401 / 403 by the authentication and role middlewares.
   */
  errors?: readonly ErrorSpec[];
}

const json = (
  schema: z.ZodTypeAny,
): Record<'application/json', { schema: ReturnType<typeof resolver> }> => ({
  'application/json': { schema: resolver(schema) },
});

/** One documented error response in the standard envelope (shared `ErrorEnvelope` component). */
export const errorResponse = (
  status: ErrorStatus,
): { description: string; content: ReturnType<typeof json> } => ({
  description: ERROR_DESCRIPTIONS[status],
  content: json(errorEnvelopeSchema),
});

/**
 * The same error response as plain OpenAPI (a `$ref` to the `ErrorEnvelope` component), for
 * responses added to the generated document afterwards: a Zod resolver is only turned into JSON
 * Schema during generation, so `errorResponse()` there would leak the raw Zod object.
 */
export const errorResponseObject = (
  status: ErrorStatus,
): {
  description: string;
  content: { 'application/json': { schema: { $ref: string } } };
} => ({
  description: ERROR_DESCRIPTIONS[status],
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
});

const codesOf = (spec: ErrorSpec): { status: ErrorStatus; codes: readonly AppErrorCode[] } =>
  typeof spec === 'number' ? { status: spec, codes: DEFAULT_ERROR_CODES[spec] } : spec;

/** `"<status> <code>"` entries of the `x-error-code-list`. */
export const errorCodeEntries = (specs: readonly ErrorSpec[]): string[] =>
  specs.flatMap((spec) => {
    const { status, codes } = codesOf(spec);
    return codes.map((code) => `${String(status)} ${code}`);
  });

/**
 * The spec fragment a middleware attaches to document the errors it causes (`validate()`,
 * `requireRole()`, …): one response per status plus its codes.
 */
export const documentErrors = (
  specs: readonly ErrorSpec[],
): {
  responses: Record<string, ReturnType<typeof errorResponse>>;
  [ERROR_CODE_LIST]: string[];
} => ({
  responses: Object.fromEntries(
    specs.map((spec) => {
      const { status } = codesOf(spec);
      return [String(status), errorResponse(status)];
    }),
  ),
  [ERROR_CODE_LIST]: errorCodeEntries(specs),
});

const contractOf = (doc: EndpointDoc, errors: readonly ErrorSpec[]): EndpointContract => {
  const errorCodes = new Map<number, Set<string>>();
  for (const spec of errors) {
    const { status, codes } = codesOf(spec);
    errorCodes.set(status, new Set([...(errorCodes.get(status) ?? []), ...codes]));
  }
  return {
    summary: doc.summary,
    successMessages: new Map(
      [doc.response, ...(doc.alsoResponds ?? [])].map((success) => [
        success.status,
        messagesOf(success),
      ]),
    ),
    errorCodes,
  };
};

/**
 * OpenAPI metadata for a route, in the standard envelopes. Request body, parameters and the 400 /
 * 413 responses come from the route's `validate()` automatically; only the response side and the
 * domain errors are described here. Under `NODE_ENV=test` the route also records what it documents,
 * so a response that disagrees with it fails the test (`contract-guard.ts`).
 */
export const describeEndpoint = (doc: EndpointDoc): MiddlewareHandler => {
  const envelope =
    'data' in doc.response
      ? successEnvelope(doc.response.data)
      : paginatedEnvelope(doc.response.paginatedItem);
  const errors: readonly ErrorSpec[] = [...(doc.errors ?? []), ...ALWAYS_POSSIBLE];
  const documented = documentErrors(errors);

  // `x-*` extensions are valid OpenAPI, but not in hono-openapi's types: the spec is cast once here.
  const middleware = describeRoute({
    tags: doc.tags,
    summary: doc.summary,
    ...(doc.description === undefined ? {} : { description: doc.description }),
    responses: {
      ...documented.responses,
      ...Object.fromEntries(
        [doc.response, ...(doc.alsoResponds ?? [])].map((success) => [
          String(success.status),
          {
            description: success.description,
            content: json(envelope),
            [SUCCESS_MESSAGES_KEY]: messagesOf(success),
          },
        ]),
      ),
    },
    [ERROR_CODE_LIST]: documented[ERROR_CODE_LIST],
  } as DescribeRouteOptions);
  if (!CONTRACT_CHECKS) return middleware;

  const contract = contractOf(doc, errors);
  const checked: MiddlewareHandler = async (c, next) => {
    setEndpointContract(contract);
    await middleware(c, next);
  };
  return Object.assign(checked, {
    [uniqueSymbol]: (middleware as unknown as Record<symbol, unknown>)[uniqueSymbol],
  });
};
