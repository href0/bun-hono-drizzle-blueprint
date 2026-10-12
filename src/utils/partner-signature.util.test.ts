import { describe, expect, it } from 'bun:test';
import {
  buildCanonicalString,
  canonicalQuery,
  type PartnerSignatureInput,
  signV1,
  verifyV1,
} from './partner-signature.util';

const SECRET = 'psk_test_9f8e7d6c5b4a39281706f5e4d3c2b1a0';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

interface SigningVector {
  name: string;
  input: PartnerSignatureInput;
  canonical: string;
  signature: string;
}

// Fixed vectors computed independently (Python hmac/hashlib/urllib.parse), never by this code.
// They are the contract published to partners: a change here breaks every partner integration.
const VECTORS: SigningVector[] = [
  {
    name: 'GET without query or body',
    input: {
      timestamp: '1760000000000',
      nonce: 'n0nce_A1b2C3d4E5f6',
      method: 'GET',
      path: '/api/v1/partner/orders',
      query: '',
      body: '',
    },
    canonical: `v1\n1760000000000\nn0nce_A1b2C3d4E5f6\nGET\n/api/v1/partner/orders\n\n${EMPTY_SHA256}`,
    signature: '9af5cd123600a57241434c215e422566c48ad95d071accbc992cdd7a401ba766',
  },
  {
    name: 'GET with an unsorted, repeated, encoded query',
    input: {
      timestamp: '1760000000000',
      nonce: 'n0nce_A1b2C3d4E5f6',
      method: 'GET',
      path: '/api/v1/partner/orders',
      query: '?status=paid&q=hello+world&a=1&a=0&name=O%27Brien*&city=Bandung%C3%A9&flag&empty=',
      body: '',
    },
    canonical:
      'v1\n1760000000000\nn0nce_A1b2C3d4E5f6\nGET\n/api/v1/partner/orders\n' +
      'a=0&a=1&city=Bandung%C3%A9&empty=&flag=&name=O%27Brien%2A&q=hello%20world&status=paid\n' +
      EMPTY_SHA256,
    signature: '8c1c9076a55878c4fadd810313c94c2d0e67dd0e5dd4d512d2f4a22486086d6a',
  },
  {
    name: 'POST with a JSON body and a trailing slash',
    input: {
      timestamp: '1760000123456',
      nonce: 'Zy-9_xW8vU7tS6rQ5pO4',
      method: 'POST',
      path: '/api/v1/partner/orders/',
      query: '',
      body: '{"amount":150000,"currency":"IDR"}',
    },
    canonical:
      'v1\n1760000123456\nZy-9_xW8vU7tS6rQ5pO4\nPOST\n/api/v1/partner/orders/\n\n' +
      'e703ba86e6a39e51e8145f59481e41a25f8bfbf7f0267b2dd2af673b9b4b3821',
    signature: 'c4ed5183646d04628267d9d7ee758744476ec2d75e42fa35e3341345d4df2271',
  },
];

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
