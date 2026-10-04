import { describe, expect, it } from 'bun:test';
import { resolveLocale } from './locale.util';

const SUPPORTED = ['id', 'en'] as const;
const resolve = (header: string | undefined): string => resolveLocale(header, SUPPORTED, 'id');

describe('resolveLocale (Unit)', () => {
  it('should fall back when the header is missing, empty or unsupported', () => {
    expect(resolve(undefined)).toBe('id');
    expect(resolve('')).toBe('id');
    expect(resolve('fr-FR, de')).toBe('id');
  });

  it('should order by q-value, not by position', () => {
    expect(resolve('id, en;q=0.1')).toBe('id');
    expect(resolve('id;q=0.2, en;q=0.9')).toBe('en');
    expect(resolve('fr;q=1, en;q=0.5, id;q=0.4')).toBe('en');
  });

  it('should keep header order for equal q-values', () => {
    expect(resolve('en, id')).toBe('en');
    expect(resolve('id, en')).toBe('id');
  });

  it('should match a regional tag to its primary language, case-insensitively', () => {
    expect(resolve('en-US')).toBe('en');
    expect(resolve('EN-gb;q=0.8')).toBe('en');
    expect(resolve('id-ID')).toBe('id');
  });

  it('should treat q=0 as not acceptable and ignore malformed q-values', () => {
    expect(resolve('en;q=0, id;q=0.5')).toBe('id');
    expect(resolve('en;q=abc')).toBe('id');
    expect(resolve('en;q=2')).toBe('id');
  });

  it('should return the fallback for a wildcard', () => {
    expect(resolveLocale('*', SUPPORTED, 'en')).toBe('en');
  });
});
