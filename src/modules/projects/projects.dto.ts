import { z } from 'zod';
import {
  booleanQueryField,
  instantRangeQuery,
  listQuerySchema,
  searchQueryField,
  strictListQuery,
} from '../../core/dto/list-query.dto';
import { isoInstant } from '../../core/openapi';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;

/** Partial update: only the given fields change. */
export const updateProjectSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255),
    isActive: z.boolean(),
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

/** Fields the list may sort by (D41); the repository maps each one to its column. */
export const PROJECT_SORTABLE = ['createdAt', 'updatedAt', 'name'] as const;

export type ProjectSortField = (typeof PROJECT_SORTABLE)[number];

/** `?sort=&q=&is_active=&created_from=&created_to=`; `q` searches the name. */
export const projectListQuerySchema = strictListQuery(
  listQuerySchema(PROJECT_SORTABLE).extend({
    q: searchQueryField,
    isActive: booleanQueryField,
    ...instantRangeQuery('created'),
  }),
  { ranges: ['created'] },
);

export type ProjectListQueryDto = z.infer<typeof projectListQuerySchema>;

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;
