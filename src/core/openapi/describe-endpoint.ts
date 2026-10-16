import type { MiddlewareHandler } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import type { z } from 'zod';
import { errorEnvelopeSchema, paginatedEnvelope, successEnvelope } from './schemas';

const ERROR_DESCRIPTIONS = {
  400: 'Invalid input: ERR_INVALID_INPUT, ERR_NON_SNAKE_CASE_KEY or ERR_INVALID_JSON',
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

/** Possible on every endpoint: the global rate limit and the error handler. */
const ALWAYS_POSSIBLE: readonly ErrorStatus[] = [429, 500];

interface SuccessDoc {
  status: 200 | 201;
  description: string;
}

export interface EndpointDoc {
  tags: string[];
  summary: string;
  description?: string;
  /** `data`: wrapped in the success envelope · `paginatedItem`: a page of items + `meta`. */
  response: SuccessDoc & ({ data: z.ZodTypeAny } | { paginatedItem: z.ZodTypeAny });
  /**
   * Domain errors this endpoint can return. Added automatically: 429 and 500 (every route), and
   * 400 / 413 by `validate()` (input / body) — list them only when returned for another reason.
   */
  errors?: readonly ErrorStatus[];
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

/**
 * OpenAPI metadata for a route, in the standard envelopes. Request body, parameters and the 400 /
 * 413 responses come from the route's `validate()` automatically; only the response side and the
 * domain errors are described here.
 */
export const describeEndpoint = (doc: EndpointDoc): MiddlewareHandler => {
  const envelope =
    'data' in doc.response
      ? successEnvelope(doc.response.data)
      : paginatedEnvelope(doc.response.paginatedItem);

  const errors = [...new Set([...(doc.errors ?? []), ...ALWAYS_POSSIBLE])].sort();
  const errorResponses = Object.fromEntries(
    errors.map((status) => [String(status), errorResponse(status)]),
  );

  return describeRoute({
    tags: doc.tags,
    summary: doc.summary,
    ...(doc.description === undefined ? {} : { description: doc.description }),
    responses: {
      [String(doc.response.status)]: {
        description: doc.response.description,
        content: json(envelope),
      },
      ...errorResponses,
    },
  });
};
