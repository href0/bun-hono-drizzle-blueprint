import { describe, expect, it } from 'bun:test';
import {
  buildCanonicalString,
  canonicalQuery,
  PARTNER_HEADERS,
  partnerSignatureHeaders,
  type PartnerSignatureInput,
  signV1,
  verifyV1,
} from './partner-signature.util';
import {
  PARTNER_SIGNING_VECTORS,
  PARTNER_TEST_SECRET,
} from '../../test/helpers/partner-signing-vectors';

const SECRET = PARTNER_TEST_SECRET;
const VECTORS = PARTNER_SIGNING_VECTORS;

describe('partner signing v1 — fixed vectors', () => {
  for (const vector of VECTORS) {
    it(`${vector.name}: canonical string, signature and verification`, () => {
      expect(buildCanonicalString(vector.input)).toBe(vector.canonical);
      expect(signV1(SECRET, vector.input)).toBe(vector.signature);
      expect(verifyV1(SECRET, vector.input, vector.signature)).toBe(true);
    });
  }
});

describe('canonicalQuery', () => {
  it('is empty without a query, with or without the leading "?"', () => {
    expect(canonicalQuery('')).toBe('');
    expect(canonicalQuery('?')).toBe('');
    expect(canonicalQuery('b=2&a=1')).toBe(canonicalQuery('?b=2&a=1'));
  });

  it('sorts by key, then by value, in code-unit order (uppercase before lowercase)', () => {
    expect(canonicalQuery('b=1&a=2&a=10&B=0')).toBe('B=0&a=10&a=2&b=1');
  });

  it('gives one spelling for equivalent encodings', () => {
    expect(canonicalQuery('q=a+b')).toBe('q=a%20b');
    expect(canonicalQuery('q=a%20b')).toBe('q=a%20b');
    expect(canonicalQuery('q=%7e%2d')).toBe('q=~-');
    expect(canonicalQuery('q=%2f')).toBe('q=%2F');
    expect(canonicalQuery('k%20ey=v')).toBe('k%20ey=v');
  });

  it('encodes the RFC 3986 reserved characters encodeURIComponent leaves alone', () => {
    expect(canonicalQuery("q=!'()*")).toBe('q=%21%27%28%29%2A');
  });

  it('drops empty pairs and keeps keys without a value as "key="', () => {
    expect(canonicalQuery('a=1&&b')).toBe('a=1&b=');
  });
});

describe('buildCanonicalString', () => {
  const base = VECTORS.at(0)?.input;
  if (!base) throw new Error('missing vector');

  it('uppercases the method and hashes raw bytes like their UTF-8 string', () => {
    const body = '{"name":"Bandungé"}';

    expect(buildCanonicalString({ ...base, method: 'post', body })).toBe(
      buildCanonicalString({ ...base, method: 'POST', body: new TextEncoder().encode(body) }),
    );
  });

  it('keeps the path exactly as sent (no trailing-slash or case normalization)', () => {
    const lines = (path: string): string | undefined =>
      buildCanonicalString({ ...base, path })
        .split('\n')
        .at(4);

    expect(lines('/api/v1/partner/orders/')).toBe('/api/v1/partner/orders/');
    expect(lines('/api/v1/Partner/%7Eorders')).toBe('/api/v1/Partner/%7Eorders');
  });
});

describe('verifyV1', () => {
  const vector = VECTORS.at(2);
  if (!vector) throw new Error('missing vector');
  const { input, signature } = vector;

  it('rejects every change to a signed part', () => {
    const tampered: PartnerSignatureInput[] = [
      { ...input, timestamp: '1760000123457' },
      { ...input, nonce: 'Zy-9_xW8vU7tS6rQ5pO5' },
      { ...input, method: 'PUT' },
      { ...input, path: '/api/v1/partner/orders' },
      { ...input, query: 'a=1' },
      { ...input, body: '{"amount":150001,"currency":"IDR"}' },
    ];

    for (const candidate of tampered) {
      expect(verifyV1(SECRET, candidate, signature)).toBe(false);
    }
  });

  it('rejects another secret and malformed signatures without throwing', () => {
    expect(verifyV1(`${SECRET}x`, input, signature)).toBe(false);
    expect(verifyV1(SECRET, input, signature.slice(0, 63))).toBe(false);
    expect(verifyV1(SECRET, input, '')).toBe(false);
    expect(verifyV1(SECRET, input, `${signature.slice(0, 62)}zz`)).toBe(false);
  });

  it('accepts the signature in uppercase hex', () => {
    expect(verifyV1(SECRET, input, signature.toUpperCase())).toBe(true);
  });
});

describe('partnerSignatureHeaders', () => {
  const withQuery = VECTORS.at(1);
  const withBody = VECTORS.at(2);
  if (!withQuery || !withBody) throw new Error('missing vector');

  it('signs an absolute URL with its query like the fixed vector', () => {
    expect(
      partnerSignatureHeaders({
        apiKey: 'pk_test',
        secret: SECRET,
        method: 'GET',
        url: `https://api.example.com${withQuery.input.path}${withQuery.input.query}`,
        timestamp: withQuery.input.timestamp,
        nonce: withQuery.input.nonce,
      }),
    ).toEqual({
      [PARTNER_HEADERS.KEY]: 'pk_test',
      [PARTNER_HEADERS.TIMESTAMP]: withQuery.input.timestamp,
      [PARTNER_HEADERS.NONCE]: withQuery.input.nonce,
      [PARTNER_HEADERS.SIGNATURE]: withQuery.signature,
    });
  });

  it('accepts a path with a body, and signs an empty body when none is given', () => {
    const headers = partnerSignatureHeaders({
      apiKey: 'pk_test',
      secret: SECRET,
      method: 'POST',
      url: withBody.input.path,
      body: withBody.input.body,
      timestamp: withBody.input.timestamp,
      nonce: withBody.input.nonce,
    });
    expect(headers[PARTNER_HEADERS.SIGNATURE]).toBe(withBody.signature);

    const noBody = VECTORS.at(0);
    if (!noBody) throw new Error('missing vector');
    expect(
      partnerSignatureHeaders({
        apiKey: 'pk_test',
        secret: SECRET,
        method: 'GET',
        url: noBody.input.path,
        timestamp: noBody.input.timestamp,
        nonce: noBody.input.nonce,
      })[PARTNER_HEADERS.SIGNATURE],
    ).toBe(noBody.signature);
  });
});
