import { varchar } from 'drizzle-orm/pg-core';
import { instant } from '../columns';
import { referenceSchema } from '../schemas';

/**
 * Reference data owned by another system: a view over an existing relation, never created or
 * migrated by drizzle-kit (`.existing()`), and read-only at compile time (`db.insert(refRoles)`
 * does not type-check).
 */
export const refRoles = referenceSchema
  .view('ref_roles', {
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 255 }),
    createdAt: instant('created_at').notNull(),
  })
  .existing();

export type RefRole = typeof refRoles.$inferSelect;
