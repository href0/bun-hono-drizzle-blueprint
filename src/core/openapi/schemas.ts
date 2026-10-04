import 'zod-openapi/extend';
import { z } from 'zod';
import { APP_ERROR_CODES, ERROR_TYPES } from '../errors/error-codes';

/**
 * Documentation-side schemas. Keys are camelCase like the DTOs; the published document is
 * converted to the snake_case wire contract by `toSnakeCaseOpenApi()`.
 */

/** A `Date` in TypeScript, documented as what goes over the wire: an ISO 8601 UTC string. */
export const isoDateTime = (): z.ZodDate =>
  z.date().openapi({ type: 'string', format: 'date-time', example: '2026-10-04T03:00:00.000Z' });

/** A timestamp already serialized to an ISO 8601 UTC string (e.g. `new Date().toISOString()`). */
export const isoDateTimeString = (): z.ZodString =>
  z.string().openapi({ format: 'date-time', example: '2026-10-04T03:00:00.000Z' });

type EnumValues<T extends Record<string, string>> = [T[keyof T], ...T[keyof T][]];

const enumOf = <T extends Record<string, string>>(values: T): z.ZodEnum<EnumValues<T>> =>
  z.enum(Object.values(values) as EnumValues<T>);

/** Mirrors `buildErrorBody()` (src/core/response/error-response.ts). */
export const errorEnvelopeSchema = z
  .object({
    success: z.literal(false),
    statusCode: z.number().int(),
    message: z.string().openapi({ description: 'Localized via Accept-Language (id | en)' }),
    error: z.object({
      type: enumOf(ERROR_TYPES),
      code: enumOf(APP_ERROR_CODES),
      origin: z.string(),
      details: z.array(z.object({ field: z.string().optional(), message: z.string() })).optional(),
    }),
    requestId: z.string(),
    timestamp: isoDateTime(),
  })
  .openapi({ ref: 'ErrorEnvelope' });

/** Mirrors `PaginationMeta` (src/core/response/api-response.ts). */
const paginationMetaSchema = z
  .object({
    currentPage: z.number().int(),
    perPage: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  })
  .openapi({ ref: 'PaginationMeta' });

interface SuccessShape<T extends z.ZodTypeAny> extends z.ZodRawShape {
  success: z.ZodLiteral<true>;
  statusCode: z.ZodNumber;
  message: z.ZodString;
  data: T;
}

/** Mirrors `ApiResponse.toJSON()` (src/core/response/api-response.ts). */
export const successEnvelope = <T extends z.ZodTypeAny>(data: T): z.ZodObject<SuccessShape<T>> =>
  z.object({
    success: z.literal(true),
    statusCode: z.number().int(),
    message: z.string().openapi({ description: 'Localized via Accept-Language (id | en)' }),
    data,
  });

export const paginatedEnvelope = <T extends z.ZodTypeAny>(
  item: T,
): z.ZodObject<SuccessShape<z.ZodArray<T>> & { meta: typeof paginationMetaSchema }> =>
  successEnvelope(z.array(item)).extend({ meta: paginationMetaSchema });
