import { describe, expect, it } from 'bun:test';
import {
  emailField,
  newPasswordField,
  MAX_PER_PAGE,
  paginationQuerySchema,
  uuidChildParamSchema,
  uuidParamSchema,
  type UuidChildParamDto,
} from './common.dto';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const CHILD_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9f';

describe('shared request schemas', () => {
  it('uuidParamSchema: a UUID id, anything else rejected', () => {
    expect(uuidParamSchema.parse({ id: ID })).toEqual({ id: ID });
    expect(uuidParamSchema.safeParse({ id: '42' }).success).toBe(false);
  });

  it('uuidChildParamSchema: header id and child id, both UUIDs (header/detail routes)', () => {
    const params: UuidChildParamDto = uuidChildParamSchema.parse({ id: ID, childId: CHILD_ID });

    expect(params).toEqual({ id: ID, childId: CHILD_ID });
    expect(uuidChildParamSchema.safeParse({ id: ID, childId: 'nope' }).success).toBe(false);
    expect(uuidChildParamSchema.safeParse({ id: 'nope', childId: CHILD_ID }).success).toBe(false);
  });

  it('paginationQuerySchema: coerces, defaults, caps per_page', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, perPage: 10 });
    expect(paginationQuerySchema.parse({ page: '3', perPage: '25' })).toEqual({
      page: 3,
      perPage: 25,
    });
    expect(paginationQuerySchema.safeParse({ perPage: String(MAX_PER_PAGE + 1) }).success).toBe(
      false,
    );
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('emailField', () => {
  it('trims and lower-cases before validating, so one address is one account', () => {
    expect(emailField.parse('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(emailField.safeParse('not-an-email').success).toBe(false);
    expect(emailField.safeParse(`${'a'.repeat(250)}@x.com`).success).toBe(false);
  });
});

describe('newPasswordField', () => {
  it('requires 8 to 1024 characters', () => {
    expect(newPasswordField.safeParse('1234567').success).toBe(false);
    expect(newPasswordField.safeParse('12345678').success).toBe(true);
    expect(newPasswordField.safeParse('x'.repeat(1025)).success).toBe(false);
  });
});
