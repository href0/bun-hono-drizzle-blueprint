import { boolean, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, softDelete, timestamps, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';

export const projects = appTable('projects', {
  id: uuidPrimaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps(),
  ...auditColumns(),
  ...softDelete(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
