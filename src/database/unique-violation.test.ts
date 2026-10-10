import { describe, expect, it } from 'bun:test';
import { isUniqueViolation } from './unique-violation';

describe('isUniqueViolation', () => {
  it('recognizes SQLSTATE 23505 on the error or its cause', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation(new Error('wrapped', { cause: { code: '23505' } }))).toBe(true);
  });

  it('rejects other errors and non-objects', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
