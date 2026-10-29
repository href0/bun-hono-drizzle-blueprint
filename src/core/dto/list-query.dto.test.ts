import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import {
  booleanQueryField,
  instantRangeQuery,
  listQuerySchema,
  MAX_SEARCH_LENGTH,
  searchQueryField,
  sortQueryField,
  strictListQuery,
} from './list-query.dto';

const sort = sortQueryField(['createdAt', 'email', 'fullName']);
const messagesOf = (result: z.SafeParseReturnType<unknown, unknown>): string[] =>
  result.success ? [] : result.error.issues.map((issue) => issue.message);

describe('sort', () => {
  it('reads comma-separated wire names, "-" descending, in order', () => {
    expect(sort.parse('-created_at,full_name')).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'fullName', direction: 'asc' },
    ]);
    expect(sort.parse(' email ')).toEqual([{ field: 'email', direction: 'asc' }]);
  });

  it('absent = the repository default', () => {
    expect(sort.parse(undefined)).toBeUndefined();
  });

  it('refuses a field outside the allowlist and names the allowed ones', () => {
    expect(messagesOf(sort.safeParse('password_hash'))).toEqual([
      'Unknown sort field "password_hash"; allowed: created_at, email, full_name',
    ]);
    // camelCase is not a wire name.
    expect(messagesOf(sort.safeParse('fullName'))[0]).toStartWith('Unknown sort field "fullName"');
  });

  it('refuses an empty key, a repeated field and more than three keys', () => {
    expect(messagesOf(sort.safeParse('email,'))[0]).toStartWith('Unknown sort field ""');
    expect(messagesOf(sort.safeParse(''))[0]).toStartWith('Unknown sort field ""');
    expect(messagesOf(sort.safeParse('email,-email'))).toEqual(['Sort field "email" repeated']);
    expect(messagesOf(sort.safeParse('email,full_name,created_at,email'))).toEqual([
      'At most 3 sort keys',
    ]);
  });
});

describe('q', () => {
  it('is trimmed and kept between 1 and MAX_SEARCH_LENGTH characters', () => {
    expect(searchQueryField.parse('  ada  ')).toBe('ada');
    expect(searchQueryField.parse(undefined)).toBeUndefined();
    expect(messagesOf(searchQueryField.safeParse('   '))).toEqual(['Must not be empty']);
    expect(searchQueryField.safeParse('x'.repeat(MAX_SEARCH_LENGTH)).success).toBe(true);
    expect(searchQueryField.safeParse('x'.repeat(MAX_SEARCH_LENGTH + 1)).success).toBe(false);
  });
});

describe('boolean filter', () => {
  it('reads exactly true / false', () => {
    expect(booleanQueryField.parse('true')).toBe(true);
    expect(booleanQueryField.parse('false')).toBe(false);
    expect(booleanQueryField.parse(undefined)).toBeUndefined();
    expect(booleanQueryField.safeParse('1').success).toBe(false);
    expect(booleanQueryField.safeParse('TRUE').success).toBe(false);
  });
});

describe('a finished list query', () => {
  const schema = strictListQuery(
    listQuerySchema(['createdAt', 'email']).extend({
      q: searchQueryField,
      ...instantRangeQuery('created'),
    }),
    { ranges: ['created'] },
  );

  it('keeps pagination defaults and parses every part', () => {
    const query = schema.parse({
      sort: '-email',
      q: 'ada',
      createdFrom: '2026-10-01T00:00:00Z',
      createdTo: '2026-10-31T00:00:00+07:00',
    });
    expect(query.page).toBe(1);
    expect(query.perPage).toBe(10);
    expect(query.sort).toEqual([{ field: 'email', direction: 'desc' }]);
    expect(query.createdFrom).toEqual(Temporal.Instant.from('2026-10-01T00:00:00Z'));
    expect(query.createdTo).toEqual(Temporal.Instant.from('2026-10-30T17:00:00Z'));
  });

  it('refuses an unknown parameter by name instead of dropping it', () => {
    const result = schema.safeParse({ sotr: 'email', role: 'admin' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['sotr', 'Unknown query parameter'],
      ['role', 'Unknown query parameter'],
    ]);
  });

  it('refuses a range whose start is after its end, at the end field', () => {
    const result = schema.safeParse({
      createdFrom: '2026-10-02T00:00:00Z',
      createdTo: '2026-10-01T00:00:00Z',
    });
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['createdTo', 'Must not be before created_from'],
    ]);
    expect(schema.safeParse({ createdFrom: '2026-10-01T00:00:00Z' }).success).toBe(true);
    expect(
      schema.safeParse({ createdFrom: '2026-10-01T00:00:00Z', createdTo: '2026-10-01T00:00:00Z' })
        .success,
    ).toBe(true);
  });

  it('refuses an instant without an offset', () => {
    expect(schema.safeParse({ createdFrom: '2026-10-01T00:00:00' }).success).toBe(false);
  });
});
