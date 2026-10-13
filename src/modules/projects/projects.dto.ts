import { z } from 'zod';
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

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;
