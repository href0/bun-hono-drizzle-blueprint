import { describe, expect, it } from 'bun:test';
import { hashPassword, verifyPassword } from './password';

describe('password security helper', () => {
  it('hashes and successfully verifies a matching password', async () => {
    const raw = 'my-secure-password-123';
    const hash = await hashPassword(raw);

    expect(hash).toStartWith('$argon2id$v=19$m=256,t=1,');
    expect(await verifyPassword(raw, hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
