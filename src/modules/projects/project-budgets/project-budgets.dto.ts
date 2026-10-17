import { z } from 'zod';
import { isoInstant } from '../../../core/openapi';

/** The parent in the path: `/projects/:projectId/budget`. */
export const projectBudgetParentParamSchema = z.object({
  projectId: z.string().uuid(),
});

export type ProjectBudgetParentParamDto = z.infer<typeof projectBudgetParentParamSchema>;

export const saveProjectBudgetSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type SaveProjectBudgetDto = z.infer<typeof saveProjectBudgetSchema>;

export const projectBudgetResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type ProjectBudgetResponse = z.infer<typeof projectBudgetResponseSchema>;
