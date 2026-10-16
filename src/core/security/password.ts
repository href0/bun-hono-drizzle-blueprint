import { appConfig } from '../../config';

/**
 * Bun's argon2id cost parameters for tests (`NODE_ENV === 'test'`): about 1 ms per hash instead of
 * about 120 ms with Bun's defaults (m=64 MiB, t=2), which every other environment keeps. A hash
 * stores its own parameters, so `verifyPassword` accepts both.
 */
const TEST_HASH_OPTIONS = { algorithm: 'argon2id', memoryCost: 256, timeCost: 1 } as const;

/** The only place that hashes a password (R75): login timing and stored hashes use one cost. */
export const hashPassword = (password: string): Promise<string> =>
  appConfig.NODE_ENV === 'test'
    ? Bun.password.hash(password, TEST_HASH_OPTIONS)
    : Bun.password.hash(password);

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  Bun.password.verify(password, hash);
