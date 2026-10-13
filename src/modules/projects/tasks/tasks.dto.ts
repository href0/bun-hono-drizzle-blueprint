import { z } from 'zod';
import { isoInstant } from '../../../core/openapi';

/** The parent in the path: `/projects/:projectId/tasks`. */
export const taskParentParamSchema = z.object({
  projectId: z.string().uuid(),
});

export type TaskParentParamDto = z.infer<typeof taskParentParamSchema>;

export const createTaskSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;

/** Partial update: only the given fields change. */
export const updateTaskSchema = createTaskSchema
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'At least one field must be provided' });

export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const taskResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type TaskResponse = z.infer<typeof taskResponseSchema>;
