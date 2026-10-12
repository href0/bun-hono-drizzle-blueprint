import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/i;

/**
 * Unguessable bearer value (refresh token, one-time links): `byteLength` random bytes as base64url
 * (32 bytes → 43 characters). Store only its `sha256Hex`, never the value itself.
 */
export const generateOpaqueToken = (byteLength = 32): string =>
  randomBytes(byteLength).toString('base64url');

/** SHA-256 of a UTF-8 string as 64 lowercase hex characters. */
export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Compares two hex digests in constant time. Malformed hex or different lengths return `false`
 * (`Buffer.from(…, 'hex')` would otherwise silently drop the invalid characters).
 */
export const timingSafeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length || !HEX_PATTERN.test(a) || !HEX_PATTERN.test(b)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};
