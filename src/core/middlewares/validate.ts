import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { findNonSnakeCaseKeys, snakeToCamelCasePreserving } from '../../utils/case-converter.util';
import { APP_ERROR_CODES } from '../errors/error-codes';
import { ValidationError } from '../errors/validation.error';
import { I18N_MESSAGES } from '../i18n/messages';

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  /**
   * Top-level body fields (snake_case names) holding free-form dictionaries: their content keeps
   * its keys as sent and is not checked for snake_case. Prefer `{ key, value }` arrays in public
   * contracts; use this only when a dictionary is unavoidable.
   */
  preserveKeys?: readonly string[];
}

/**
 * Snake_case request contract: clients send snake_case keys (like every response). A key in any
 * other casing is rejected with 400 instead of being silently ignored; accepted payloads are
 * converted to camelCase so DTOs keep TypeScript naming. Route params are not converted.
 */
const toCamelCasePayload = (payload: unknown, preserveKeys: readonly string[]): unknown => {
  const offending = findNonSnakeCaseKeys(payload, preserveKeys);
  if (offending.length > 0) {
    throw new ValidationError(I18N_MESSAGES.NON_SNAKE_CASE_KEYS, {
      code: APP_ERROR_CODES.NON_SNAKE_CASE_KEY,
      details: offending.map((field) => ({
        field,
        verbatimField: true,
        message: I18N_MESSAGES.NON_SNAKE_CASE_KEY_DETAIL,
      })),
    });
  }
  return snakeToCamelCasePreserving(payload, preserveKeys);
};

export const validate = (schemas: ValidationSchemas): MiddlewareHandler => {
  const preserveKeys = schemas.preserveKeys ?? [];

  return async (c, next) => {
    try {
      if (schemas.body) {
        const rawBody = toCamelCasePayload(await parseRequestBody(c), preserveKeys);
        const validatedBody: unknown = await schemas.body.parseAsync(rawBody);
        c.set('validatedBody', validatedBody);
      }

      if (schemas.query) {
        const rawQuery = toCamelCasePayload(c.req.query(), []);
        const validatedQuery: unknown = await schemas.query.parseAsync(rawQuery);
        c.set('validatedQuery', validatedQuery);
      }

      if (schemas.params) {
        const rawParams = c.req.param();
        const validatedParams: unknown = await schemas.params.parseAsync(rawParams);
        c.set('validatedParams', validatedParams);
      }

      await next();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        throw new ValidationError(I18N_MESSAGES.VALIDATION_FAILED, { details: errorMessages });
      }
      throw error;
    }
  };
};

/**
 * Parses the request body safely based on Content-Type.
 *
 * Behavior:
 * - Returns parsed JSON object if Content-Type includes 'application/json'
 * - Returns empty object {} for requests with no body or non-JSON content types
 * - Throws ValidationError explicitly if Content-Type is application/json but body is malformed
 *
 * This ensures "malformed JSON" and "missing body" produce distinct, actionable error messages
 * rather than both silently collapsing to {} and producing misleading Zod field errors.
 */
const parseRequestBody = async (c: Context): Promise<unknown> => {
  const contentType = c.req.header('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return {};
  }

  try {
    return (await c.req.json()) as unknown;
  } catch {
    throw new ValidationError(I18N_MESSAGES.INVALID_JSON_BODY, {
      code: APP_ERROR_CODES.INVALID_JSON,
      details: [{ field: 'body', message: 'Request body contains invalid JSON syntax' }],
    });
  }
};

export const getValidatedBody = <T>(c: Context): T => {
  return c.get('validatedBody') as T;
};

export const getValidatedQuery = <T>(c: Context): T => {
  return c.get('validatedQuery') as T;
};

export const getValidatedParams = <T>(c: Context): T => {
  return c.get('validatedParams') as T;
};
