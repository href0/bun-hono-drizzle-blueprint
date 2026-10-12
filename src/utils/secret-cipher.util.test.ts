import { describe, expect, it } from 'bun:test';
import { createSecretCipher, SecretCipherError } from './secret-cipher.util';

const K0 = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const K1 = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
const SECRET = 'psk_test_9f8e7d6c5b4a39281706f5e4d3c2b1a0';

// Sealed with K0 (IV 000102…0b, AAD "v1.k0") by node:crypto directly, not by this module: proves
// the stored format stays readable across releases and key rotations.
const STORED_WITH_K0 =
  'v1.k0.AAECAwQFBgcICQoL.cD14VMvnwSdAgF124jHRVg.ZmveaTQsvsKWAgnEVOIAGQ0AxUqaN0KtARN2_BKEH1LWoIYJ0I3gRqo';

const replacePart = (payload: string, index: number, value: string): string =>
  payload
    .split('.')
    .map((part, i) => (i === index ? value : part))
    .join('.');

const flipFirstChar = (value: string): string =>
  `${value.startsWith('A') ? 'B' : 'A'}${value.slice(1)}`;

describe('createSecretCipher', () => {
  it('round-trips with the v1 format, a fresh IV each time', () => {
    const cipher = createSecretCipher({ activeKeyId: 'k1', keys: { k1: K1 } });

    const first = cipher.encrypt(SECRET);
    const second = cipher.encrypt(SECRET);

    expect(first).toMatch(/^v1\.k1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(SECRET);
    expect(cipher.decrypt(first)).toBe(SECRET);
    expect(cipher.decrypt(second)).toBe(SECRET);
    expect(cipher.decrypt(cipher.encrypt(''))).toBe('');
    expect(cipher.decrypt(cipher.encrypt('rahasia é ✓'))).toBe('rahasia é ✓');
  });

  it('decrypts a payload stored with an older key after the active key rotates', () => {
    const before = createSecretCipher({ activeKeyId: 'k0', keys: { k0: K0 } });
    const after = createSecretCipher({ activeKeyId: 'k1', keys: { k1: K1, k0: K0 } });

    expect(before.decrypt(STORED_WITH_K0)).toBe(SECRET);
    expect(after.decrypt(STORED_WITH_K0)).toBe(SECRET);
    expect(after.needsReEncryption(STORED_WITH_K0)).toBe(true);

    const reEncrypted = after.encrypt(after.decrypt(STORED_WITH_K0));
    expect(reEncrypted.startsWith('v1.k1.')).toBe(true);
    expect(after.needsReEncryption(reEncrypted)).toBe(false);
  });

  it('refuses a payload whose key has left the keyring', () => {
    const cipher = createSecretCipher({ activeKeyId: 'k1', keys: { k1: K1 } });

    expect(() => cipher.decrypt(STORED_WITH_K0)).toThrow(SecretCipherError);
    expect(() => cipher.decrypt(STORED_WITH_K0)).toThrow('Key "k0" is not in the keyring');
  });

  it('refuses tampered payloads: ciphertext, tag, IV, relabelled key, wrong key', () => {
    const cipher = createSecretCipher({ activeKeyId: 'k0', keys: { k0: K0, k1: K1 } });
    const parts = STORED_WITH_K0.split('.');
    const tampered = [
      replacePart(STORED_WITH_K0, 4, flipFirstChar(parts[4] ?? '')),
      replacePart(STORED_WITH_K0, 3, flipFirstChar(parts[3] ?? '')),
      replacePart(STORED_WITH_K0, 2, flipFirstChar(parts[2] ?? '')),
      // Same bytes, other label: the key ID is authenticated (AAD), so k1 cannot be tried.
      replacePart(STORED_WITH_K0, 1, 'k1'),
    ];

    for (const payload of tampered) {
      expect(() => cipher.decrypt(payload)).toThrow('Secret payload failed authentication');
    }
    const otherKeyNamedK0 = createSecretCipher({ activeKeyId: 'k0', keys: { k0: K1 } });
    expect(() => otherKeyNamedK0.decrypt(STORED_WITH_K0)).toThrow(
      'Secret payload failed authentication',
    );
  });

  it('refuses malformed payloads before decrypting', () => {
    const cipher = createSecretCipher({ activeKeyId: 'k0', keys: { k0: K0 } });
    const [, , iv = '', tag = ''] = STORED_WITH_K0.split('.');
    const malformed = [
      '',
      'not-a-payload',
      STORED_WITH_K0.replace('v1.', 'v2.'),
      `${STORED_WITH_K0}.extra`,
      replacePart(STORED_WITH_K0, 1, ''),
      replacePart(STORED_WITH_K0, 1, 'k 0'),
      replacePart(STORED_WITH_K0, 2, iv.slice(0, 12)),
      replacePart(STORED_WITH_K0, 3, `${tag}AA`),
      replacePart(STORED_WITH_K0, 4, 'abc$'),
      // Not canonical base64url: decodes to the same bytes as the real tag.
      // The tag's 22nd character carries 4 padding bits: 'g' (…000000) → 'h' (…000001).
      replacePart(STORED_WITH_K0, 3, `${tag.slice(0, 21)}h`),
    ];

    for (const payload of malformed) {
      expect(() => cipher.decrypt(payload)).toThrow('Malformed secret payload');
    }
    expect(() => cipher.needsReEncryption('not-a-payload')).toThrow(SecretCipherError);
  });

  it('fails fast on an invalid keyring without echoing key material', () => {
    const shortKey = 'abcd';
    const cases: [Parameters<typeof createSecretCipher>[0], string][] = [
      [{ activeKeyId: 'k2', keys: { k1: K1 } }, 'Active key "k2" is not in the keyring'],
      [{ activeKeyId: 'k1', keys: {} }, 'Active key "k1" is not in the keyring'],
      [{ activeKeyId: 'k1', keys: { k1: shortKey } }, 'Key "k1" must be 64 hex characters'],
      [{ activeKeyId: 'k1', keys: { k1: `${K1.slice(0, 63)}g` } }, 'must be 64 hex characters'],
      [{ activeKeyId: 'k.1', keys: { 'k.1': K1 } }, 'Invalid key ID "k.1"'],
    ];

    for (const [keyring, message] of cases) {
      expect(() => createSecretCipher(keyring)).toThrow(message);
    }
    try {
      createSecretCipher({ activeKeyId: 'k1', keys: { k1: shortKey } });
    } catch (error) {
      expect(error).toBeInstanceOf(SecretCipherError);
      expect((error as Error).message).not.toContain(shortKey);
    }
  });
});
