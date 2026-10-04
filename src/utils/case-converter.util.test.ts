import { describe, expect, it } from 'bun:test';
import {
  toSnakeCase,
  toCamelCase,
  camelToSnakeCase,
  snakeToCamelCase,
  snakeToCamelCasePreserving,
  isSnakeCaseKey,
  findNonSnakeCaseKeys,
} from './case-converter.util';

/** The previous (quadratic) implementation, kept only as the behavioural reference. */
const legacyToSnakeCase = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

describe('toSnakeCase — linear implementation', () => {
  it('should produce exactly the same output as the legacy regex implementation', () => {
    const alphabet = ['a', 'b', 'A', 'B', 'C', '0', '9', '_', '-'];
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let run = 0; run < 5000; run += 1) {
      const length = Math.floor(random() * 12);
      const key = Array.from(
        { length },
        () => alphabet[Math.floor(random() * alphabet.length)],
      ).join('');
      expect(toSnakeCase(key)).toBe(legacyToSnakeCase(key));
    }
  });

  it('should handle acronyms like the legacy implementation', () => {
    expect(toSnakeCase('HTTPServer')).toBe('http_server');
    expect(toSnakeCase('parseHTTPResponse2Fast')).toBe('parse_http_response2_fast');
  });

  it('should stay linear on hostile keys (100k uppercase characters)', () => {
    const hostile = 'A'.repeat(100_000);
    const start = performance.now();
    toSnakeCase(hostile);
    isSnakeCaseKey(hostile);
    toCamelCase(`${'a_'.repeat(50_000)}b`);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe('isSnakeCaseKey / findNonSnakeCaseKeys', () => {
  it('should accept snake_case keys only', () => {
    for (const key of ['page', 'user_id', 'address_line_2', '2fa_enabled']) {
      expect(isSnakeCaseKey(key)).toBe(true);
    }
    for (const key of [
      'fullName',
      'Full_name',
      'full-name',
      '_private',
      'double__underscore',
      'trailing_',
      '',
    ]) {
      expect(isSnakeCaseKey(key)).toBe(false);
    }
  });

  it('should report every offending key with its path as sent', () => {
    expect(
      findNonSnakeCaseKeys({
        full_name: 'A',
        fullName: 'B',
        address: { postal_code: '1', streetName: 'x' },
        items: [{ item_code: 'a' }, { itemCode: 'b' }],
        created_at: new Date(0),
      }),
    ).toEqual(['fullName', 'address.streetName', 'items.1.itemCode']);
  });

  it('should not inspect the content of preserved top-level keys', () => {
    expect(findNonSnakeCaseKeys({ metadata: { anyKey: 1, 'x-y': 2 } }, ['metadata'])).toEqual([]);
    expect(findNonSnakeCaseKeys({ myMetadata: {} }, ['myMetadata'])).toEqual(['myMetadata']);
  });

  it('should ignore primitives and top-level arrays of primitives', () => {
    expect(findNonSnakeCaseKeys('text')).toEqual([]);
    expect(findNonSnakeCaseKeys([1, 'a', null])).toEqual([]);
  });
});

describe('snakeToCamelCasePreserving', () => {
  it('should convert keys but keep preserved dictionaries verbatim', () => {
    expect(
      snakeToCamelCasePreserving(
        { full_name: 'A', metadata: { any_key: 1, otherKey: 2 }, nested_obj: { inner_key: 3 } },
        ['metadata'],
      ),
    ).toEqual({ fullName: 'A', metadata: { any_key: 1, otherKey: 2 }, nestedObj: { innerKey: 3 } });
  });

  it('should delegate non-object roots to the plain conversion', () => {
    expect(snakeToCamelCasePreserving([{ a_b: 1 }], [])).toEqual([{ aB: 1 }]);
    expect(snakeToCamelCasePreserving(null, [])).toBeNull();
  });
});

describe('CaseConverter Utility (Unit)', () => {
  it('should convert strings to snake_case deterministically', () => {
    expect(toSnakeCase('camelCase')).toBe('camel_case');
    expect(toSnakeCase('PascalCase')).toBe('pascal_case');
    expect(toSnakeCase('userID')).toBe('user_id');
    expect(toSnakeCase('')).toBe('');
  });

  it('should convert strings to camelCase deterministically', () => {
    expect(toCamelCase('snake_case')).toBe('snakeCase');
    expect(toCamelCase('kebab-case')).toBe('kebabCase');
    expect(toCamelCase('user_id')).toBe('userId');
    expect(toCamelCase('')).toBe('');
  });

  it('should recursively convert nested object keys to snake_case', () => {
    const date = new Date();
    const regex = /abc/g;
    const input = {
      userId: 101,
      userName: 'John Doe',
      createdAt: date,
      pattern: regex,
      tags: ['alpha', 'beta'],
      addressInfo: {
        streetName: 'Main St',
        postalCode: '12345',
        metaData: {
          nestedKey: true,
        },
      },
    };

    const result = camelToSnakeCase(input) as Record<string, any>;
    expect(result.user_id).toBe(101);
    expect(result.user_name).toBe('John Doe');
    expect(result.created_at).toBe(date);
    expect(result.pattern).toBe(regex);
    expect(result.tags).toEqual(['alpha', 'beta']);
    expect(result.address_info.street_name).toBe('Main St');
    expect(result.address_info.postal_code).toBe('12345');
    expect(result.address_info.meta_data.nested_key).toBe(true);
  });

  it('should handle primitives, null, and undefined safely', () => {
    expect(camelToSnakeCase(null)).toBeNull();
    expect(camelToSnakeCase(undefined)).toBeUndefined();
    expect(camelToSnakeCase(123)).toBe(123);
    expect(camelToSnakeCase('simpleString')).toBe('simpleString');

    expect(snakeToCamelCase(null)).toBeNull();
    expect(snakeToCamelCase(undefined)).toBeUndefined();
    expect(snakeToCamelCase(456)).toBe(456);
    expect(snakeToCamelCase('simple_string')).toBe('simple_string');
  });

  it('should recursively convert nested object keys to camelCase', () => {
    const input = {
      user_id: 101,
      user_name: 'John Doe',
      nested_data: {
        item_code: 'ITM-1',
      },
    };

    const result = snakeToCamelCase(input) as Record<string, any>;
    expect(result.userId).toBe(101);
    expect(result.userName).toBe('John Doe');
    expect(result.nestedData.itemCode).toBe('ITM-1');
  });

  it('should keep Date and RegExp instances intact and convert arrays to camelCase', () => {
    const createdAt = new Date(0);
    const pattern = /a_b/;

    const result = snakeToCamelCase({
      created_at: createdAt,
      match_pattern: pattern,
      line_items: [{ item_code: 'A' }, 'raw_value'],
    }) as Record<string, any>;

    expect(result.createdAt).toBe(createdAt);
    expect(result.matchPattern).toBe(pattern);
    expect(result.lineItems).toEqual([{ itemCode: 'A' }, 'raw_value']);
  });
});
