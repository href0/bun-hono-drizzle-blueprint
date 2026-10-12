import { describe, expect, it } from 'bun:test';
import { sha256Hex } from '../../utils/crypto.util';
import {
  hashPartnerApiKey,
  issuePartnerApiKey,
  issuePartnerSecret,
  PARTNER_API_KEY_PREFIX,
  partnerSecretCipher,
} from './partner-credentials';

describe('issuePartnerApiKey', () => {
  it('issues pk_ + 32 random bytes, stored only as its SHA-256 and a short prefix', () => {
    const issued = issuePartnerApiKey();

    expect(issued.apiKey).toMatch(/^pk_[A-Za-z0-9_-]{43}$/);
    expect(issued.apiKey.startsWith(PARTNER_API_KEY_PREFIX)).toBe(true);
    expect(issued.apiKeyHash).toBe(sha256Hex(issued.apiKey));
    expect(issued.apiKeyHash).toBe(hashPartnerApiKey(issued.apiKey));
    expect(issued.apiKeyPrefix).toBe(issued.apiKey.slice(0, 11));
    expect(issued.apiKeyPrefix.length).toBeLessThanOrEqual(16); // api_key_prefix varchar(16)
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 50 }, () => issuePartnerApiKey().apiKey));
    expect(keys.size).toBe(50);
  });
});

describe('issuePartnerSecret', () => {
  it('issues 32 random bytes as base64url', () => {
    const secret = issuePartnerSecret();

    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    expect(issuePartnerSecret()).not.toBe(secret);
  });
});

describe('partnerSecretCipher', () => {
  it('encrypts with the configured active key and decrypts back', () => {
    const secret = issuePartnerSecret();
    const payload = partnerSecretCipher.encrypt(secret);

    // The test keyring (partner.config.ts TEST_DEFAULTS) has the single key "test".
    expect(payload.startsWith('v1.test.')).toBe(true);
    expect(payload).not.toContain(secret);
    expect(partnerSecretCipher.decrypt(payload)).toBe(secret);
  });
});
