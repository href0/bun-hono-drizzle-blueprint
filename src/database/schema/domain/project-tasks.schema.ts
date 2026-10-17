import { index, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, parentReference, softDelete, timestamps, uuidPrimaryKey } from '../columns';
import { appTable } from '../schemas';
import { projects } from './projects.schema';

/** Dependent: own page and soft delete, always under one project (DependentRepository). */
export const projectTasks = appTable(
  'project_tasks',
  {
    id: uuidPrimaryKey(),
    projectId: parentReference('project_id', () => projects.id),
    name: varchar('name', { length: 255 }).notNull(),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [index('project_tasks_project_idx').on(table.projectId)],
);

export type ProjectTask = typeof projectTasks.$inferSelect;
