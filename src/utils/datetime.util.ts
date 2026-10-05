import { Temporal } from 'temporal-polyfill';

/**
 * The only place that creates or converts time values (ESLint bans `new Date(...)` — even for
 * "now" — `Date.parse` and local-time getters/formatters everywhere else in `src/`).
 *
 * Three kinds of time, never mixed (plan D13):
 * - **instant** (`*_at`): an exact moment — `Temporal.Instant`, `timestamptz`, ISO 8601 UTC on the wire;
 * - **calendar date** (`*_date`): a day with no time zone — `Temporal.PlainDate`, `date`, `YYYY-MM-DD`;
 * - **local schedule**: an instant plus the IANA zone it was planned in (`*_timezone`).
 */

export type DateTimeErrorReason =
  | 'INVALID_INSTANT'
  | 'MISSING_OFFSET'
  | 'INVALID_DATE'
  | 'INVALID_TIME'
  | 'INVALID_TIME_ZONE'
  | 'NONEXISTENT_LOCAL_TIME'
  | 'AMBIGUOUS_LOCAL_TIME';

/** A value that is not a valid instant / date / time / zone, with the precise reason. */
export class DateTimeError extends Error {
  constructor(
    readonly reason: DateTimeErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'DateTimeError';
  }
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WALL_TIME = /^\d{2}:\d{2}(?::\d{2})?$/;

export const nowInstant = (): Temporal.Instant => Temporal.Now.instant();

/** `2026-10-05T03:00:00.000Z` — always UTC, always milliseconds (same shape as `Date#toISOString`). */
export const toIsoUtc = (instant: Temporal.Instant): string =>
  instant.toString({ fractionalSecondDigits: 3 });

export const nowIsoUtc = (): string => toIsoUtc(nowInstant());

/** "Now" for a `timestamptz` column the driver handles as `Date` (e.g. Drizzle `$onUpdate`). */
export const nowAsDate = (): Date => instantToDate(nowInstant());

/**
 * Parses an ISO 8601 instant. An offset (`Z` or `+07:00`) is mandatory: without it the moment
 * depends on whoever reads it, which is exactly the bug this standard prevents.
 */
export const parseInstant = (text: string): Temporal.Instant => {
  try {
    return Temporal.Instant.from(text);
  } catch {
    let missingOffset = false;
    try {
      Temporal.PlainDateTime.from(text);
      missingOffset = true;
    } catch {
      // not a date-time at all
    }
    throw missingOffset
      ? new DateTimeError('MISSING_OFFSET', `"${text}" has no UTC offset; add Z or ±HH:MM`)
      : new DateTimeError('INVALID_INSTANT', `"${text}" is not an ISO 8601 instant`);
  }
};

/** Parses exactly `YYYY-MM-DD` (no time part, no out-of-range day such as 2026-02-30). */
export const parseCalendarDate = (text: string): Temporal.PlainDate => {
  if (!CALENDAR_DATE.test(text)) {
    throw new DateTimeError('INVALID_DATE', `"${text}" is not a YYYY-MM-DD date`);
  }
  try {
    return Temporal.PlainDate.from(text, { overflow: 'reject' });
  } catch {
    throw new DateTimeError('INVALID_DATE', `"${text}" is not a valid calendar date`);
  }
};

/** IANA zone names only (`Asia/Jakarta`, `UTC`); fixed offsets like `+07:00` are not zones. */
export const isValidTimeZone = (zone: string): boolean => {
  if (zone === '' || zone.startsWith('+') || zone.startsWith('-')) return false;
  try {
    Temporal.Now.zonedDateTimeISO(zone);
    return true;
  } catch {
    return false;
  }
};

const assertTimeZone = (zone: string): void => {
  if (!isValidTimeZone(zone)) {
    throw new DateTimeError('INVALID_TIME_ZONE', `"${zone}" is not an IANA time zone`);
  }
};

/**
 * The instants bounding one calendar day in a zone, half-open `[start, end)` — use
 * `>= start AND < end` in queries. Correct across DST changes (a day can last 23 or 25 hours).
 */
export const dayRangeInZone = (
  date: Temporal.PlainDate,
  zone: string,
): { start: Temporal.Instant; end: Temporal.Instant } => {
  assertTimeZone(zone);
  return {
    start: date.toZonedDateTime({ timeZone: zone }).toInstant(),
    end: date.add({ days: 1 }).toZonedDateTime({ timeZone: zone }).toInstant(),
  };
};

/**
 * The instant of a wall-clock time (`HH:mm` or `HH:mm:ss`) on a date in a zone. Rejects times that
 * do not exist (skipped by a DST jump) or exist twice (repeated by a DST fall-back) instead of
 * silently picking one.
 */
export const wallTimeToInstant = (
  date: Temporal.PlainDate,
  time: string,
  zone: string,
): Temporal.Instant => {
  assertTimeZone(zone);
  if (!WALL_TIME.test(time)) {
    throw new DateTimeError('INVALID_TIME', `"${time}" is not an HH:mm[:ss] time`);
  }
  let wallTime: Temporal.PlainTime;
  try {
    wallTime = Temporal.PlainTime.from(time, { overflow: 'reject' });
  } catch {
    throw new DateTimeError('INVALID_TIME', `"${time}" is not a valid time`);
  }

  const local = date.toPlainDateTime(wallTime);
  try {
    return local.toZonedDateTime(zone, { disambiguation: 'reject' }).toInstant();
  } catch {
    const earlier = local.toZonedDateTime(zone, { disambiguation: 'earlier' });
    const exists = earlier.toPlainTime().equals(wallTime);
    throw exists
      ? new DateTimeError('AMBIGUOUS_LOCAL_TIME', `${local.toString()} occurs twice in ${zone}`)
      : new DateTimeError(
          'NONEXISTENT_LOCAL_TIME',
          `${local.toString()} does not exist in ${zone}`,
        );
  }
};

/** Driver boundary: the postgres driver reads and writes `timestamptz` as `Date`. */
export const instantFromDate = (date: Date): Temporal.Instant =>
  Temporal.Instant.fromEpochMilliseconds(date.getTime());

export const instantToDate = (instant: Temporal.Instant): Date =>
  new Date(instant.epochMilliseconds);
