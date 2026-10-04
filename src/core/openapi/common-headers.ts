import { SUPPORTED_LOCALES } from '../../config';
import { REQUEST_ID_HEADER } from '../middlewares/request-context';

interface Operation {
  parameters?: unknown[];
  responses?: Record<string, object>;
}

interface DocumentShape {
  paths: Record<string, Record<string, unknown>>;
  components: { parameters?: Record<string, unknown>; headers?: Record<string, unknown> };
}

const ref = (kind: 'parameters' | 'headers', name: string): { $ref: string } => ({
  $ref: `#/components/${kind}/${name}`,
});

const integerHeader = (description: string): object => ({
  description,
  schema: { type: 'integer' },
});

/* eslint-disable @typescript-eslint/naming-convention -- OpenAPI component names are PascalCase by convention (like ErrorEnvelope) */
const COMMON_PARAMETERS = {
  AcceptLanguage: {
    in: 'header',
    name: 'Accept-Language',
    required: false,
    description: `Language of response messages: ${SUPPORTED_LOCALES.join(' | ')} (q-values honoured; unsupported or missing = DEFAULT_LOCALE).`,
    schema: { type: 'string', example: 'en' },
  },
  RequestId: {
    in: 'header',
    name: REQUEST_ID_HEADER,
    required: false,
    description:
      'Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated.',
    schema: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' },
  },
};

const COMMON_HEADERS = {
  RequestId: { description: 'Correlation id of this request', schema: { type: 'string' } },
  ContentLanguage: {
    description: 'Language of `message`',
    schema: { type: 'string', enum: [...SUPPORTED_LOCALES] },
  },
  RateLimitLimit: integerHeader(
    'Requests allowed per window (global rate limit; not on health probes)',
  ),
  RateLimitRemaining: integerHeader('Requests left in the current window'),
  RateLimitReset: integerHeader('Seconds until the window resets'),
  RetryAfter: integerHeader('Seconds to wait before retrying'),
};

/* eslint-enable @typescript-eslint/naming-convention -- end of the OpenAPI component name maps */

const RATE_LIMIT_HEADERS = {
  'RateLimit-Limit': ref('headers', 'RateLimitLimit'),
  'RateLimit-Remaining': ref('headers', 'RateLimitRemaining'),
  'RateLimit-Reset': ref('headers', 'RateLimitReset'),
};

const isOperation = (value: unknown): value is Operation =>
  typeof value === 'object' && value !== null && 'responses' in value;

/**
 * Documents the headers every endpoint shares, set by the platform middlewares rather than by
 * routes: `Accept-Language` / `X-Request-ID` in; `X-Request-ID`, `Content-Language` and the
 * `RateLimit-*` headers out; `Retry-After` on 429.
 */
export const addCommonHeaders = <T extends DocumentShape>(document: T): T => {
  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, item]) => [
      path,
      Object.fromEntries(
        Object.entries(item).map(([method, operation]) => {
          if (!isOperation(operation)) return [method, operation];
          const responses = Object.fromEntries(
            Object.entries(operation.responses ?? {}).map(([status, response]) => [
              status,
              '$ref' in response
                ? response
                : {
                    ...response,
                    headers: {
                      [REQUEST_ID_HEADER]: ref('headers', 'RequestId'),
                      'Content-Language': ref('headers', 'ContentLanguage'),
                      ...RATE_LIMIT_HEADERS,
                      ...(status === '429' ? { 'Retry-After': ref('headers', 'RetryAfter') } : {}),
                    },
                  },
            ]),
          );
          return [
            method,
            {
              ...operation,
              parameters: [
                ...(operation.parameters ?? []),
                ref('parameters', 'AcceptLanguage'),
                ref('parameters', 'RequestId'),
              ],
              responses,
            },
          ];
        }),
      ),
    ]),
  );

  return {
    ...document,
    paths,
    components: {
      ...document.components,
      parameters: { ...document.components.parameters, ...COMMON_PARAMETERS },
      headers: { ...document.components.headers, ...COMMON_HEADERS },
    },
  };
};
