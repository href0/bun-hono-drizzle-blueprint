import 'zod-openapi/extend';
import { z } from 'zod';
import type { Temporal } from 'temporal-polyfill';
import {
  DateTimeError,
  isValidTimeZone,
  parseCalendarDate,
  parseInstant,
} from '../../utils/datetime.util';

/**
 * Request fields for the three kinds of time (D13). Validation messages describe the expected
 * format and never echo the submitted value.
 */

const INSTANT_EXAMPLE = '2026-10-05T03:00:00Z';

const parseWith =
  <T>(parse: (text: string) => T, message: string) =>
  (text: string, ctx: z.RefinementCtx): T => {
    try {
      return parse(text);
    } catch (error: unknown) {
      if (!(error instanceof DateTimeError)) throw error;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
  };

/** `*_at`: ISO 8601 with a mandatory offset (`Z` or `±HH:MM`) → `Temporal.Instant`. */
export const instantField = z
  .string()
  .transform(
    parseWith<Temporal.Instant>(
      parseInstant,
      `Must be an ISO 8601 date-time with a UTC offset, e.g. ${INSTANT_EXAMPLE}`,
    ),
  )
  .openapi({ type: 'string', format: 'date-time', example: INSTANT_EXAMPLE });

/** `*_date`: exactly `YYYY-MM-DD` → `Temporal.PlainDate`. */
export const calendarDateField = z
  .string()
  .transform(
    parseWith<Temporal.PlainDate>(parseCalendarDate, 'Must be a calendar date as YYYY-MM-DD'),
  )
  .openapi({ type: 'string', format: 'date', example: '2026-10-05' });

/** `*_timezone`: an IANA zone name (`Asia/Jakarta`, `UTC`); fixed offsets are rejected. */
export const timeZoneField = z
  .string()
  .refine(isValidTimeZone, 'Must be an IANA time zone, e.g. Asia/Jakarta')
  .openapi({ example: 'Asia/Jakarta' });
