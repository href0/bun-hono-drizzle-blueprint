import { z } from 'zod';

/** The most ids one replace takes: far above any real set of permissions or roles. */
export const REPLACE_MAX_ITEMS = 1000;

/**
 * A list of a replace body (D72): the whole wanted set, UUIDs, each once; `[]` = none. A
 * duplicate is a 400 naming its index — the frontend sent something it did not mean.
 */
export const idSetField = z
  .array(z.string().uuid())
  .max(REPLACE_MAX_ITEMS)
  .superRefine((ids, ctx) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'Listed more than once',
        });
      }
      seen.add(id);
    });
  });

/** `PUT /roles/:id/permissions`: every permission the role should hold. */
export const replaceRolePermissionsSchema = z.object({ permissionIds: idSetField });

export type ReplaceRolePermissionsDto = z.infer<typeof replaceRolePermissionsSchema>;

/** One permission or role a replace added, removed or kept. */
export const changedItemSchema = z.object({ id: z.string().uuid(), key: z.string() });

export type ChangedItem = z.infer<typeof changedItemSchema>;

/** What a replace did, each list by key (D72). */
export const accessChangeSchema = z.object({
  added: z.array(changedItemSchema),
  removed: z.array(changedItemSchema),
  unchanged: z.array(changedItemSchema),
});

export type AccessChange = z.infer<typeof accessChangeSchema>;
