import 'zod-openapi/extend';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { APP_ERROR_CODES, ERROR_TYPES } from '../errors/error-codes';

/**
 * Documentation-side schemas. Keys are camelCase like the DTOs; the published document is
 * converted to the snake_case wire contract by `toSnakeCaseOpenApi()`.
 */

/**
 * A `Temporal.Instant` (instant columns), documented as an ISO 8601 UTC string —
 * always with milliseconds on the wire (`toWireTime()` in `ApiResponse`).
 */
export const isoInstant = (): z.ZodType<Temporal.Instant> =>
  z.instanceof(Temporal.Instant).openapi({ type: 'string', format: 'date-time' });

/** A `Temporal.PlainDate` (calendar date columns), documented as `YYYY-MM-DD`. */
export const isoCalendarDate = (): z.ZodType<Temporal.PlainDate> =>
  z.instanceof(Temporal.PlainDate).openapi({ type: 'string', format: 'date' });

/** A timestamp already serialized to an ISO 8601 UTC string (e.g. `nowIsoUtc()`). */
export const isoDateTimeString = (): z.ZodString => z.string().openapi({ format: 'date-time' });

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
      origin: z.string().openapi({ description: '`APP`, or the code of the failing integration' }),
      vendorName: z.string().optional().openapi({
        description: 'Name of the failing external system (EXTERNAL_SERVICE_ERROR only)',
      }),
      details: z.array(z.object({ field: z.string().optional(), message: z.string() })).optional(),
    }),
    requestId: z.string(),
    timestamp: isoDateTimeString(),
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
