import { createHmac } from 'node:crypto';
import { sha256Hex, timingSafeEqualHex } from './crypto.util';

/** First line of the canonical string; a future scheme gets a new version, never a changed v1. */
export const PARTNER_SIGNATURE_VERSION = 'v1';

/** Request headers of signing spec v1 (docs/partner-integration-guide.md). */
export const PARTNER_HEADERS = {
  KEY: 'x-partner-key',
  TIMESTAMP: 'x-partner-timestamp',
  NONCE: 'x-partner-nonce',
  SIGNATURE: 'x-partner-signature',
} as const;

/** What a partner request is signed over (header values exactly as sent). */
export interface PartnerSignatureInput {
  /** `x-partner-timestamp`: Unix epoch milliseconds, as sent. */
  timestamp: string;
  /** `x-partner-nonce`, as sent. */
  nonce: string;
  method: string;
  /** URL path exactly as sent, without the query string; trailing slashes are not normalized. */
  path: string;
  /** Raw query string, with or without the leading `?` (empty when there is none). */
  query: string;
  /** Raw request body bytes (empty when there is none). */
  body: string | Uint8Array;
}

/** `encodeURIComponent` leaves `!'()*` alone; RFC 3986 reserves them. */
const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const compareCodeUnits = (a: string, b: string): number => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/**
 * The query as the server reads it, in one spelling: pairs decoded the way the router decodes
 * them (`+` is a space, `a` = `a=`), re-encoded per RFC 3986 (uppercase hex, unreserved
 * `A-Za-z0-9-._~` literal), sorted by key then value in code-unit order, joined with `&`.
 * Repeated keys keep every value. No query → `''`.
 */
export const canonicalQuery = (rawQuery: string): string => {
  const query = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
  return [...new URLSearchParams(query)]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(
      ([keyA, valueA], [keyB, valueB]) =>
        compareCodeUnits(keyA, keyB) || compareCodeUnits(valueA, valueB),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
};

/**
 * `v1 \n timestamp \n nonce \n METHOD \n path \n canonicalQuery \n sha256hex(body)` — the
 * partner signing spec v1 (partner integration guide). Changing it breaks every partner.
 */
export const buildCanonicalString = (input: PartnerSignatureInput): string =>
  [
    PARTNER_SIGNATURE_VERSION,
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.path,
    canonicalQuery(input.query),
    sha256Hex(input.body),
  ].join('\n');

/** `x-partner-signature`: HMAC-SHA256 of the canonical string, 64 lowercase hex characters. */
export const signV1 = (secret: string, input: PartnerSignatureInput): string =>
  createHmac('sha256', secret).update(buildCanonicalString(input), 'utf8').digest('hex');

/**
 * Whether `signature` is the v1 signature of the request, compared in constant time. Hex case is
 * not significant; anything that is not 64 hex characters is simply `false`.
 */
export const verifyV1 = (
  secret: string,
  input: PartnerSignatureInput,
  signature: string,
): boolean => timingSafeEqualHex(signV1(secret, input), signature);

export interface PartnerRequestToSign {
  apiKey: string;
  secret: string;
  method: string;
  /** Absolute URL, or a path with its query (`/api/v1/partner/echo?x=1`), exactly as it is sent. */
  url: string;
  /** The exact body bytes sent (`''` for none). */
  body?: string | Uint8Array;
  /** Unix epoch milliseconds, as a string. */
  timestamp: string;
  /** Single use: `^[A-Za-z0-9_-]{16,64}$`. */
  nonce: string;
}

/** The four `x-partner-*` headers of a request signed per spec v1 (clients, tools and tests). */
export const partnerSignatureHeaders = (request: PartnerRequestToSign): Record<string, string> => {
  const { pathname, search } = new URL(request.url, 'http://partner.invalid');
  return {
    [PARTNER_HEADERS.KEY]: request.apiKey,
    [PARTNER_HEADERS.TIMESTAMP]: request.timestamp,
    [PARTNER_HEADERS.NONCE]: request.nonce,
    [PARTNER_HEADERS.SIGNATURE]: signV1(request.secret, {
      timestamp: request.timestamp,
      nonce: request.nonce,
      method: request.method,
      path: pathname,
      query: search,
      body: request.body ?? '',
    }),
  };
};
