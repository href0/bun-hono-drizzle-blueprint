import type { PartnerSignatureInput } from '../../src/utils/partner-signature.util';

/**
 * The published signing v1 test vectors (docs/partner-integration-guide.md §5), shared by the
 * signing unit tests and the guide guard (test/partner-guide.test.ts).
 */
export const PARTNER_TEST_SECRET = 'psk_test_9f8e7d6c5b4a39281706f5e4d3c2b1a0';
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface SigningVector {
  name: string;
  input: PartnerSignatureInput;
  canonical: string;
  signature: string;
}

// Fixed vectors computed independently (Python hmac/hashlib/urllib.parse), never by this code.
// They are the contract published to partners: a change here breaks every partner integration.
export const PARTNER_SIGNING_VECTORS: SigningVector[] = [
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
