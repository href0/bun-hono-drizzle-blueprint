import { boolean, varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';

/** Standalone table (BaseRepository): audited, soft-deleted, email unique among live users. */
export const users = appTable(
  'users',
  {
    id: uuidPrimaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [activeUniqueIndex('users_email_active_uq', [table.email], table.deletedAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
