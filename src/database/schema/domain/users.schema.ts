import { uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { nowAsDate } from '../../../utils/datetime.util';
import { domainTable } from './schema';

export const users = domainTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(nowAsDate),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
