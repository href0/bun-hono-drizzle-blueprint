import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import packageJson from '../package.json';
import { APP_ERROR_CODES } from '../src/core/errors/error-codes';
import { canonicalQuery, PARTNER_HEADERS } from '../src/utils/partner-signature.util';
import { PARTNER_SIGNING_VECTORS, PARTNER_TEST_SECRET } from './helpers/partner-signing-vectors';

/**
 * docs/partner-integration-guide.md is what partners implement against: it must not drift from the
 * code. The vectors, headers and error codes it publishes are checked here.
 */
const guide = readFileSync(
  resolve(import.meta.dir, '../docs/partner-integration-guide.md'),
  'utf8',
);

describe('partner integration guide (docs/partner-integration-guide.md)', () => {
  it('publishes the same test vectors the signing code is tested with', () => {
    expect(guide).toContain(PARTNER_TEST_SECRET);
    for (const vector of PARTNER_SIGNING_VECTORS) {
      expect(guide).toContain(vector.signature);
      expect(guide).toContain(vector.input.nonce);
      const query = canonicalQuery(vector.input.query);
      if (query !== '') expect(guide).toContain(query);
    }
    // The canonical string printed in full (vector #3) is exactly the tested one.
    expect(guide).toContain(PARTNER_SIGNING_VECTORS.at(2)?.canonical ?? '<missing vector>');
  });

  it('describes each of the four request headers in its own row of the header table', () => {
    for (const header of Object.values(PARTNER_HEADERS)) {
      expect(guide).toContain(`\n| \`${header}\` |`);
    }
  });

  it('documents every ERR_PARTNER_* code', () => {
    const partnerCodes = Object.values(APP_ERROR_CODES).filter((code) =>
      code.startsWith('ERR_PARTNER_'),
    );
    expect(partnerCodes.length).toBe(6);
    for (const code of partnerCodes) expect(guide).toContain(`\`${code}\``);
  });

  it('points to a signing tool that exists', () => {
    expect(guide).toContain('bun run partner:sign');
    expect(Object.keys(packageJson.scripts)).toContain('partner:sign');
  });
});
