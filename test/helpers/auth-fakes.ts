import type { AuthRepository } from '../../src/modules/auth/auth.repository';
import type { AuthUsersRepository } from '../../src/modules/auth/auth-users.repository';
import type { AuthRefreshToken, NewAuthRefreshToken, User } from '../../src/database/schema';
import { nowInstant, parseInstant } from '../../src/utils/datetime.util';

/** The repository methods AuthService uses, implemented over arrays (state you can inspect). */
export type FakeTokenRepository = Pick<
  AuthRepository,
  | 'insert'
  | 'findByHash'
  | 'findByHashForUpdate'
  | 'markRotated'
  | 'revokeFamily'
  | 'revokeAllForUser'
>;
export type FakeUsersRepository = Pick<AuthUsersRepository, 'findByEmail' | 'findById' | 'create'>;

export const sampleUser = (overrides: Partial<User> = {}): User => ({
  id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
  email: 'ada@example.com',
  fullName: 'Ada Lovelace',
  // Filled in by the tests that log in (hashing is slow; most tests never need it).
  passwordHash: 'not-a-real-hash',
  role: 'user',
  isActive: true,
  createdAt: parseInstant('2026-10-01T00:00:00Z'),
  updatedAt: parseInstant('2026-10-01T00:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
  ...overrides,
});

/**
 * In-memory stand-ins for AuthRepository and AuthUsersRepository with the same observable
 * behaviour (revocations only touch usable tokens, soft-deleted users are invisible). Used by the
 * service unit tests and, through `spyOn` on the singletons, by the auth e2e tests.
 */
export const createAuthFakes = (
  initialUsers: User[] = [],
): {
  tokens: AuthRefreshToken[];
  users: User[];
  tokenRepository: FakeTokenRepository;
  usersRepository: FakeUsersRepository;
} => {
  const tokens: AuthRefreshToken[] = [];
  const users = [...initialUsers];
  const byHash = (hash: string): AuthRefreshToken | null =>
    tokens.find((token) => token.tokenHash === hash) ?? null;
  const revokeWhere = (match: (token: AuthRefreshToken) => boolean): void => {
    for (const token of tokens) {
      if (token.revokedAt === null && match(token)) token.revokedAt = nowInstant();
    }
  };
  const live = (user: User): boolean => user.deletedAt === null;

  const tokenRepository: FakeTokenRepository = {
    insert: (token: NewAuthRefreshToken) => {
      const row: AuthRefreshToken = {
        id: Bun.randomUUIDv7(),
        revokedAt: null,
        replacedById: null,
        userAgent: null,
        ip: null,
        createdAt: nowInstant(),
        ...token,
      };
      tokens.push(row);
      return Promise.resolve(row);
    },
    findByHash: (hash: string) => Promise.resolve(byHash(hash)),
    findByHashForUpdate: (hash: string) => Promise.resolve(byHash(hash)),
    markRotated: (id: string, replacedById: string) => {
      const token = tokens.find((candidate) => candidate.id === id);
      if (token?.revokedAt === null) {
        token.revokedAt = nowInstant();
        token.replacedById = replacedById;
      }
      return Promise.resolve();
    },
    revokeFamily: (familyId: string) => {
      revokeWhere((token) => token.familyId === familyId);
      return Promise.resolve();
    },
    revokeAllForUser: (userId: string) => {
      revokeWhere((token) => token.userId === userId);
      return Promise.resolve();
    },
  };

  const usersRepository: FakeUsersRepository = {
    findByEmail: (email: string) =>
      Promise.resolve(users.find((user) => live(user) && user.email === email) ?? null),
    findById: (id: string) =>
      Promise.resolve(users.find((user) => live(user) && user.id === id) ?? null),
    create: (input) => {
      const user = sampleUser({
        ...input,
        id: Bun.randomUUIDv7(),
        role: input.role ?? 'user',
        isActive: input.isActive ?? true,
      });
      users.push(user);
      return Promise.resolve(user);
    },
  };

  return { tokens, users, tokenRepository, usersRepository };
};
