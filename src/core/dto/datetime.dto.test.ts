import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { createSchema } from 'zod-openapi';
import { calendarDateField, instantField, timeZoneField } from './datetime.dto';

const schema = z.object({
  startsAt: instantField,
  dueDate: calendarDateField.optional(),
  timezone: timeZoneField,
});

describe('datetime DTO fields', () => {
  it('parse valid input into Temporal values', () => {
    const result = schema.parse({
      startsAt: '2026-10-05T10:00:00+07:00',
      dueDate: '2026-10-05',
      timezone: 'Asia/Jakarta',
    });

    expect(result.startsAt).toBeInstanceOf(Temporal.Instant);
    expect(result.startsAt.toString()).toBe('2026-10-05T03:00:00Z');
    expect(result.dueDate).toBeInstanceOf(Temporal.PlainDate);
    expect(result.timezone).toBe('Asia/Jakarta');
  });

  it('reject bad input with format messages that never echo the submitted value', () => {
    const result = schema.safeParse({
      startsAt: '2026-10-05T10:00:00',
      dueDate: '2026-02-30',
      timezone: '+07:00',
    });

    expect(result.success).toBe(false);
    const issues = result.error?.issues.map((issue) => [issue.path.join('.'), issue.message]);
    expect(issues).toEqual([
      ['startsAt', 'Must be an ISO 8601 date-time with a UTC offset, e.g. 2026-10-05T03:00:00Z'],
      ['dueDate', 'Must be a calendar date as YYYY-MM-DD'],
      ['timezone', 'Must be an IANA time zone, e.g. Asia/Jakarta'],
    ]);
    expect(JSON.stringify(issues)).not.toContain('2026-02-30');
  });

  it('are documented as strings with date-time / date formats', () => {
    const { schema: json } = createSchema(schema, { schemaType: 'input' });
    expect(json).toMatchObject({
      properties: {
        startsAt: { type: 'string', format: 'date-time' },
        dueDate: { type: 'string', format: 'date' },
        timezone: { type: 'string', example: 'Asia/Jakarta' },
      },
      required: ['startsAt', 'timezone'],
    });
  });

  it('rethrow unexpected (non-DateTimeError) failures instead of hiding them', () => {
    const exploding = z.object({ startsAt: instantField });
    expect(() => exploding.parse({ startsAt: 42 })).toThrow();
  });
});
