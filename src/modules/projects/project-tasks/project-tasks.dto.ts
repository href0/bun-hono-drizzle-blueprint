import { z } from 'zod';
import { isoInstant } from '../../../core/openapi';

/** The parent in the path: `/projects/:projectId/tasks`. */
export const projectTaskParentParamSchema = z.object({
  projectId: z.string().uuid(),
});

export type ProjectTaskParentParamDto = z.infer<typeof projectTaskParentParamSchema>;

export const createProjectTaskSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type CreateProjectTaskDto = z.infer<typeof createProjectTaskSchema>;

/** Partial update: only the given fields change. */
export const updateProjectTaskSchema = createProjectTaskSchema
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type UpdateProjectTaskDto = z.infer<typeof updateProjectTaskSchema>;

export const projectTaskResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type ProjectTaskResponse = z.infer<typeof projectTaskResponseSchema>;
