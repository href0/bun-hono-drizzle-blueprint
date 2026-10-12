/**
 * Roles for `requireRole()` (plan D6: simple RBAC). Stored in `users.role` (varchar(20), database
 * default `'user'`); the schema cannot import this file, so `src/database/roles-column.test.ts`
 * keeps both in sync. Adding a role: append it here — no migration needed unless it is longer
 * than 20 characters or becomes the default.
 */
export const ROLES = ['admin', 'user'] as const;

export type Role = (typeof ROLES)[number];

/** `users.role` is a plain varchar: narrow it before trusting it. */
export const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

/** Role of a user created without one (the `users.role` column default). */
export const DEFAULT_ROLE: Role = 'user';
