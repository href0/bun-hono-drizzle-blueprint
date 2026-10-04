import { describe, expect, it } from 'bun:test';
import {
  toSnakeCase,
  toCamelCase,
  camelToSnakeCase,
  snakeToCamelCase,
} from './case-converter.util';

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
