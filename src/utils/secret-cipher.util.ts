import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const FORMAT_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/**
 * Keys by ID (64 hex characters = 32 bytes each) plus the one that encrypts. Older keys stay in
 * the ring only to decrypt what they sealed until it is re-encrypted with the active key.
 */
export interface SecretKeyring {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
}

export interface SecretCipher {
  /** `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts), sealed with the active key. */
  encrypt: (plaintext: string) => string;
  /** The plaintext; throws {@link SecretCipherError} if the payload is malformed or tampered. */
  decrypt: (payload: string) => string;
  /** Whether the payload was sealed with a key other than the active one (re-encrypt it). */
  needsReEncryption: (payload: string) => boolean;
}

/** Bad keyring or undecryptable payload. Messages never contain key material or plaintext. */
export class SecretCipherError extends Error {
  override readonly name = 'SecretCipherError';
}

interface ParsedPayload {
  keyId: string;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

const decodeBase64Url = (value: string, expectedBytes?: number): Buffer => {
  // Buffer.from(…, 'base64url') silently drops characters outside the alphabet.
  if (!BASE64URL_PATTERN.test(value)) throw new SecretCipherError('Malformed secret payload');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) {
    throw new SecretCipherError('Malformed secret payload');
  }
  if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
    throw new SecretCipherError('Malformed secret payload');
  }
  return bytes;
};

const parsePayload = (payload: string): ParsedPayload => {
  const parts = payload.split('.');
  const [version, keyId = '', iv = '', tag = '', ciphertext = ''] = parts;
  if (parts.length !== 5 || version !== FORMAT_VERSION || !KEY_ID_PATTERN.test(keyId)) {
    throw new SecretCipherError('Malformed secret payload');
  }
  return {
    keyId,
    iv: decodeBase64Url(iv, IV_BYTES),
    tag: decodeBase64Url(tag, TAG_BYTES),
    ciphertext: decodeBase64Url(ciphertext),
  };
};

/** The version and key ID are authenticated too, so a payload cannot be relabelled. */
const additionalData = (keyId: string): Buffer => Buffer.from(`${FORMAT_VERSION}.${keyId}`, 'utf8');

const loadKeys = (keyring: SecretKeyring): ReadonlyMap<string, Buffer> => {
  const entries = Object.entries(keyring.keys);
  for (const [keyId, hex] of entries) {
    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new SecretCipherError(`Invalid key ID "${keyId}": use 1-32 of [A-Za-z0-9_-]`);
    }
    if (!KEY_HEX_PATTERN.test(hex)) {
      throw new SecretCipherError(`Key "${keyId}" must be ${String(KEY_BYTES * 2)} hex characters`);
    }
  }
  return new Map(entries.map(([keyId, hex]) => [keyId, Buffer.from(hex, 'hex')]));
};

/**
 * AES-256-GCM for secrets the server must read back (an HMAC secret it verifies signatures with,
 * a vendor token it sends): a fresh random
 * 12-byte IV per encryption, the 16-byte tag checked on decrypt. The payload names its key, so
 * rotating the active key keeps every older payload readable while its key stays in the ring.
 * Throws {@link SecretCipherError} at creation for an invalid keyring (fail fast at startup).
 */
export const createSecretCipher = (keyring: SecretKeyring): SecretCipher => {
  const keys = loadKeys(keyring);
  const { activeKeyId } = keyring;
  const activeKey = keys.get(activeKeyId);
  if (!activeKey) {
    throw new SecretCipherError(`Active key "${activeKeyId}" is not in the keyring`);
  }

  const encrypt = (plaintext: string): string => {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, activeKey, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(additionalData(activeKeyId));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      FORMAT_VERSION,
      activeKeyId,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  };

  const decrypt = (payload: string): string => {
    const { keyId, iv, tag, ciphertext } = parsePayload(payload);
    const key = keys.get(keyId);
    if (!key) throw new SecretCipherError(`Key "${keyId}" is not in the keyring`);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(keyId));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new SecretCipherError('Secret payload failed authentication');
    }
  };

  const needsReEncryption = (payload: string): boolean =>
    parsePayload(payload).keyId !== activeKeyId;

  return { encrypt, decrypt, needsReEncryption };
};
