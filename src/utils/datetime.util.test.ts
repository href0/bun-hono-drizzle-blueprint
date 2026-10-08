import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import {
  dayRangeInZone,
  formatWallClock,
  DateTimeError,
  instantFromDate,
  instantToDate,
  isValidTimeZone,
  nowInstant,
  nowIsoUtc,
  parseCalendarDate,
  parseInstant,
  toIsoUtc,
  toWireTime,
  wallTimeToInstant,
  type DateTimeErrorReason,
} from './datetime.util';

/** The reason of the DateTimeError thrown by `fn`, or a marker when it does not throw one. */
const reasonOf = (fn: () => unknown): DateTimeErrorReason | 'no DateTimeError' => {
  try {
    fn();
  } catch (error: unknown) {
    if (error instanceof DateTimeError) return error.reason;
  }
  return 'no DateTimeError';
};

const date = (text: string): Temporal.PlainDate => parseCalendarDate(text);

describe('instants', () => {
  it('parses any offset and prints UTC with milliseconds', () => {
    expect(toIsoUtc(parseInstant('2026-10-05T10:00:00+07:00'))).toBe('2026-10-05T03:00:00.000Z');
    expect(toIsoUtc(parseInstant('2026-10-05T03:00:00.123Z'))).toBe('2026-10-05T03:00:00.123Z');
  });

  it('rejects a date-time without offset (MISSING_OFFSET) and garbage (INVALID_INSTANT)', () => {
    expect(reasonOf(() => parseInstant('2026-10-05T10:00:00'))).toBe('MISSING_OFFSET');
    expect(reasonOf(() => parseInstant('2026-10-05'))).toBe('MISSING_OFFSET');
    expect(reasonOf(() => parseInstant('yesterday'))).toBe('INVALID_INSTANT');
  });

  it('gives "now" as an instant and as an ISO UTC string', () => {
    const before = Date.now();
    expect(nowInstant().epochMilliseconds).toBeGreaterThanOrEqual(before);
    expect(nowIsoUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('converts to and from Date (library boundary) without losing milliseconds', () => {
    const instant = parseInstant('2026-10-05T03:00:00.456Z');
    const roundTrip = instantFromDate(instantToDate(instant));
    expect(roundTrip.equals(instant)).toBe(true);
    expect(instantToDate(instant).toISOString()).toBe('2026-10-05T03:00:00.456Z');
  });
});

describe('calendar dates', () => {
  it('accepts exactly YYYY-MM-DD', () => {
    expect(date('2026-10-05').toString()).toBe('2026-10-05');
  });

  it('rejects other shapes and impossible days', () => {
    for (const text of ['2026-10-05T00:00', '20261005', '05-10-2026', '2026-02-30', '2026-13-01']) {
      expect(reasonOf(() => parseCalendarDate(text))).toBe('INVALID_DATE');
    }
  });
});

describe('time zones', () => {
  it('accepts IANA names and rejects offsets, empty and unknown names', () => {
    expect(isValidTimeZone('Asia/Jakarta')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    for (const zone of ['', '+07:00', '-05:00', 'Mars/Olympus_Mons']) {
      expect(isValidTimeZone(zone)).toBe(false);
    }
  });
});

describe('dayRangeInZone', () => {
  it('bounds a day in Asia/Jayapura (UTC+9) — starts the previous evening in UTC', () => {
    const { start, end } = dayRangeInZone(date('2026-10-05'), 'Asia/Jayapura');
    expect(toIsoUtc(start)).toBe('2026-10-04T15:00:00.000Z');
    expect(toIsoUtc(end)).toBe('2026-10-05T15:00:00.000Z');
  });

  it('is the UTC day in UTC', () => {
    const { start, end } = dayRangeInZone(date('2026-10-05'), 'UTC');
    expect(toIsoUtc(start)).toBe('2026-10-05T00:00:00.000Z');
    expect(toIsoUtc(end)).toBe('2026-10-06T00:00:00.000Z');
  });

  it('follows DST: the spring-forward day in New York lasts 23 hours', () => {
    const { start, end } = dayRangeInZone(date('2026-03-08'), 'America/New_York');
    expect(end.since(start).total('hours')).toBe(23);
  });

  it('rejects an invalid zone', () => {
    expect(reasonOf(() => dayRangeInZone(date('2026-10-05'), 'Nowhere/City'))).toBe(
      'INVALID_TIME_ZONE',
    );
  });
});

describe('wallTimeToInstant', () => {
  it('converts a wall-clock time in a zone', () => {
    const instant = wallTimeToInstant(date('2026-10-05'), '09:30', 'Asia/Jakarta');
    expect(toIsoUtc(instant)).toBe('2026-10-05T02:30:00.000Z');
    expect(toIsoUtc(wallTimeToInstant(date('2026-10-05'), '09:30:15', 'UTC'))).toBe(
      '2026-10-05T09:30:15.000Z',
    );
  });

  it('rejects a time skipped by DST (America/New_York 2026-03-08 02:30)', () => {
    expect(reasonOf(() => wallTimeToInstant(date('2026-03-08'), '02:30', 'America/New_York'))).toBe(
      'NONEXISTENT_LOCAL_TIME',
    );
  });

  it('rejects a time repeated by DST (America/New_York 2026-11-01 01:30)', () => {
    expect(reasonOf(() => wallTimeToInstant(date('2026-11-01'), '01:30', 'America/New_York'))).toBe(
      'AMBIGUOUS_LOCAL_TIME',
    );
  });

  it('rejects malformed times, impossible times and invalid zones', () => {
    expect(reasonOf(() => wallTimeToInstant(date('2026-10-05'), '9:30', 'UTC'))).toBe(
      'INVALID_TIME',
    );
    expect(reasonOf(() => wallTimeToInstant(date('2026-10-05'), '24:30', 'UTC'))).toBe(
      'INVALID_TIME',
    );
    expect(reasonOf(() => wallTimeToInstant(date('2026-10-05'), '09:30', '+07:00'))).toBe(
      'INVALID_TIME_ZONE',
    );
  });
});

describe('formatWallClock', () => {
  it('shows an instant in a zone with its offset', () => {
    const instant = parseInstant('2026-10-05T03:00:00.123Z');
    expect(formatWallClock(instant, 'Asia/Jakarta')).toBe('2026-10-05 10:00:00.123 +07:00');
    expect(formatWallClock(instant, 'Asia/Jayapura')).toBe('2026-10-05 12:00:00.123 +09:00');
    expect(formatWallClock(instant, 'UTC')).toBe('2026-10-05 03:00:00.123 +00:00');
  });
});

describe('toWireTime', () => {
  it('writes every instant with millisecond precision, whatever the stored precision', () => {
    expect(toWireTime(parseInstant('2026-10-05 10:00:00.123456+07'))).toBe(
      '2026-10-05T03:00:00.123Z',
    );
    expect(toWireTime(parseInstant('2026-10-05 10:00:00+07'))).toBe('2026-10-05T03:00:00.000Z');
  });

  it('writes calendar dates as YYYY-MM-DD', () => {
    expect(toWireTime(parseCalendarDate('2026-10-05'))).toBe('2026-10-05');
  });

  it('walks arrays and plain objects and leaves other values intact', () => {
    const at = parseInstant('2026-10-05T03:00:00Z');
    const other = new Map([['k', at]]);
    expect(toWireTime({ list: [{ at }], name: 'x', count: 1, none: null, other })).toEqual({
      list: [{ at: '2026-10-05T03:00:00.000Z' }],
      name: 'x',
      count: 1,
      none: null,
      other,
    });
  });
});
