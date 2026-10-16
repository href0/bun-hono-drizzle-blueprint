import { resolver, type DescribeRouteOptions } from 'hono-openapi';
import type { z } from 'zod';
import { createSchema } from 'zod-openapi';
import { APP_ERROR_CODES, type AppErrorCode } from '../errors/error-codes';
import { ERROR_CODE_LIST, errorCodeEntries, errorResponse } from './describe-endpoint';

type Parameter = NonNullable<DescribeRouteOptions['parameters']>[number];
type ParameterSchema = Extract<Parameter, { in: string }>['schema'];

const toParameters = (
  location: 'query' | 'path',
  schema: z.ZodTypeAny | undefined,
): Parameter[] => {
  if (!schema) return [];
  const { schema: json } = createSchema(schema as z.ZodType, { schemaType: 'input' });
  if (!('properties' in json) || json.properties === undefined) return [];

  const required = new Set(json.required ?? []);
  return Object.entries(json.properties).map(([name, property]) => ({
    in: location,
    name,
    required: location === 'path' || required.has(name),
    schema: property as ParameterSchema,
  }));
};

/**
 * OpenAPI request description derived from the same Zod schemas `validate()` enforces, so the
 * docs cannot drift from validation: body, parameters, and the responses validation itself causes —
 * 400 (invalid input, non-snake_case key, malformed JSON) and, with a body, 413 (body limit).
 * Names stay camelCase here; the published document is converted to snake_case (path parameter
 * names are kept: they must match the route path).
 */
export const describeRequest = (schemas: {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}): DescribeRouteOptions => {
  const parameters = [
    ...toParameters('query', schemas.query),
    ...toParameters('path', schemas.params),
  ];
  const validates = schemas.body !== undefined || parameters.length > 0;
  // Codes `validate()` itself sends: snake_case keys are checked in body and query, JSON in the body.
  const inputCodes: [AppErrorCode, ...AppErrorCode[]] = [
    APP_ERROR_CODES.INVALID_INPUT,
    ...(schemas.body || schemas.query ? [APP_ERROR_CODES.NON_SNAKE_CASE_KEY] : []),
    ...(schemas.body ? [APP_ERROR_CODES.INVALID_JSON] : []),
  ];
  const errorCodes = validates
    ? errorCodeEntries([
        { status: 400, codes: inputCodes },
        ...(schemas.body ? [413 as const] : []),
      ])
    : [];

  return {
    ...(errorCodes.length > 0 ? { [ERROR_CODE_LIST]: errorCodes } : {}),
    ...(schemas.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: resolver(schemas.body) } },
          },
        }
      : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(validates
      ? {
          responses: {
            '400': errorResponse(400),
            ...(schemas.body ? { '413': errorResponse(413) } : {}),
          },
        }
      : {}),
  };
};
