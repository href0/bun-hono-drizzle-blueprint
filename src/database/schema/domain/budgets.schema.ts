import { varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  parentReference,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';
import { projects } from './projects.schema';

/** Dependent section: at most one live row per project (DependentRepository). */
export const budgets = appTable(
  'budgets',
  {
    id: uuidPrimaryKey(),
    projectId: parentReference('project_id', () => projects.id),
    name: varchar('name', { length: 255 }).notNull(),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [activeUniqueIndex('budgets_project_unique', [table.projectId], table.deletedAt)],
);

export type Budget = typeof budgets.$inferSelect;
