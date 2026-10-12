import { partnerConfig } from '../../config';
import { generateOpaqueToken, sha256Hex } from '../../utils/crypto.util';
import { createSecretCipher, type SecretCipher } from '../../utils/secret-cipher.util';

/** Marks a value as a partner API key (in logs, leaked-secret scanners, support requests). */
export const PARTNER_API_KEY_PREFIX = 'pk_';

/** How much of the key is stored in clear to recognize it in lists: `pk_` + 8 characters. */
const STORED_PREFIX_LENGTH = PARTNER_API_KEY_PREFIX.length + 8;

export interface IssuedPartnerApiKey {
  /** Shown once to the admin (create / rotation response), never stored. */
  apiKey: string;
  /** What is stored and looked up: SHA-256 hex of the key. */
  apiKeyHash: string;
  apiKeyPrefix: string;
}

/**
 * The SHA-256 of a presented API key — the only form stored. A key is 256 random bits, so a fast
 * hash is enough (no password-style stretching needed) and lookups stay one indexed read.
 */
export const hashPartnerApiKey = (apiKey: string): string => sha256Hex(apiKey);

/** `pk_` + 32 random bytes (base64url). */
export const issuePartnerApiKey = (): IssuedPartnerApiKey => {
  const apiKey = `${PARTNER_API_KEY_PREFIX}${generateOpaqueToken()}`;
  return {
    apiKey,
    apiKeyHash: hashPartnerApiKey(apiKey),
    apiKeyPrefix: apiKey.slice(0, STORED_PREFIX_LENGTH),
  };
};

/** HMAC secret for signing v1: 32 random bytes (base64url). Stored only encrypted. */
export const issuePartnerSecret = (): string => generateOpaqueToken();

/**
 * Encrypts partner HMAC secrets at rest with the PARTNER_SECRET_* keyring. One instance for the
 * admin API (encrypts) and the partner gateway (decrypts to verify signatures).
 */
export const partnerSecretCipher: SecretCipher = createSecretCipher({
  activeKeyId: partnerConfig.PARTNER_SECRET_ACTIVE_KEY_ID,
  keys: partnerConfig.PARTNER_SECRET_KEYS,
});
