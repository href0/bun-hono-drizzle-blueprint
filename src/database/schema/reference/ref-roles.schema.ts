import { pgSchema, varchar, timestamp } from 'drizzle-orm/pg-core';

export const referenceSchema = pgSchema('ref_schema');

export const refRoles = referenceSchema.table('ref_roles', {
  code: varchar('code', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RefRole = typeof refRoles.$inferSelect;
