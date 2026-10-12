import { describe, expect, it } from 'bun:test';
import { generateOpaqueToken, sha256Hex, timingSafeEqualHex } from './crypto.util';

describe('generateOpaqueToken', () => {
  it('returns 32 random bytes as base64url by default', () => {
    const token = generateOpaqueToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats and honours a custom length', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateOpaqueToken()));

    expect(tokens.size).toBe(100);
    expect(Buffer.from(generateOpaqueToken(48), 'base64url')).toHaveLength(48);
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the UTF-8 bytes', () => {
    expect(sha256Hex('é')).toBe(sha256Hex('é'));
    expect(sha256Hex('é')).not.toBe(sha256Hex('é'));
  });
});

describe('timingSafeEqualHex', () => {
  const digest = sha256Hex('value');

  it('is true only for the same digest (case-insensitive hex)', () => {
    expect(timingSafeEqualHex(digest, digest)).toBe(true);
    expect(timingSafeEqualHex(digest, digest.toUpperCase())).toBe(true);
    expect(timingSafeEqualHex(digest, sha256Hex('other'))).toBe(false);
  });

  it('is false for different lengths or malformed hex instead of throwing', () => {
    expect(timingSafeEqualHex(digest, digest.slice(0, 62))).toBe(false);
    expect(timingSafeEqualHex('zz', 'zz')).toBe(false);
    expect(timingSafeEqualHex('abc', 'abc')).toBe(false);
    // Buffer.from would read both as the single byte 0xab and call them equal.
    expect(timingSafeEqualHex('abzz', 'abyy')).toBe(false);
  });
});
