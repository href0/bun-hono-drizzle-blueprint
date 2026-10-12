import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { PartnerCredential } from '../../database/schema';
import {
  issuedPartnerCredentialSchema,
  partnerCredentialResponseSchema,
  rotatedApiKeySchema,
  rotatedSecretSchema,
} from './partner-credentials.dto';
import {
  toIssuedPartnerCredentialResponse,
  toPartnerCredentialListResponse,
  toPartnerCredentialResponse,
  toRotatedApiKeyResponse,
  toRotatedSecretResponse,
} from './partner-credentials.transformer';

const credential: PartnerCredential = {
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  partnerCode: 'acme',
  partnerName: 'Acme Corp',
  apiKeyHash: 'a'.repeat(64),
  apiKeyPrefix: 'pk_abcdefgh',
  encryptedSecret: 'v1.test.iv.tag.ciphertext',
  ipWhitelist: ['203.0.113.0/24'],
  allowedRoutes: ['/orders/*'],
  rateLimitRpm: 60,
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T04:00:00Z'),
  createdBy: 'user:admin',
  updatedBy: 'user:admin',
  deletedAt: null,
};

const SENSITIVE = ['apiKeyHash', 'encryptedSecret', 'createdBy', 'updatedBy', 'deletedAt'];

describe('partner credential transformers', () => {
  it('expose only the response fields — never the key hash or the encrypted secret', () => {
    const response = toPartnerCredentialResponse(credential);

    expect(Object.keys(response).sort()).toEqual(
      Object.keys(partnerCredentialResponseSchema.shape).sort(),
    );
    for (const key of SENSITIVE) expect(response).not.toHaveProperty(key);
    expect(JSON.stringify(response)).not.toContain(credential.apiKeyHash);
    expect(JSON.stringify(response)).not.toContain(credential.encryptedSecret);
    expect(toPartnerCredentialListResponse([credential])).toEqual([response]);
  });

  it('add the one-time values to create and rotation responses only', () => {
    const base = toPartnerCredentialResponse(credential);

    const issued = toIssuedPartnerCredentialResponse({ credential, apiKey: 'pk_x', secret: 's' });
    expect(issued).toEqual({ ...base, apiKey: 'pk_x', secret: 's' });
    expect(issuedPartnerCredentialSchema.parse(issued)).toEqual(issued);

    const rotatedKey = toRotatedApiKeyResponse({ credential, apiKey: 'pk_y' });
    expect(rotatedKey).toEqual({ ...base, apiKey: 'pk_y' });
    expect(rotatedApiKeySchema.parse(rotatedKey)).toEqual(rotatedKey);

    const rotatedSecret = toRotatedSecretResponse({ credential, secret: 't' });
    expect(rotatedSecret).toEqual({ ...base, secret: 't' });
    expect(rotatedSecretSchema.parse(rotatedSecret)).toEqual(rotatedSecret);
  });
});
