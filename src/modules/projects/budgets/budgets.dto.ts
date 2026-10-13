import { z } from 'zod';
import { isoInstant } from '../../../core/openapi';

/** The parent in the path: `/projects/:projectId/budget`. */
export const budgetParentParamSchema = z.object({
  projectId: z.string().uuid(),
});

export type BudgetParentParamDto = z.infer<typeof budgetParentParamSchema>;

export const saveBudgetSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export type SaveBudgetDto = z.infer<typeof saveBudgetSchema>;

export const budgetResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type BudgetResponse = z.infer<typeof budgetResponseSchema>;
