import { z } from 'zod';
import { putGrantSchema } from './rbac-user-access.dto';

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
    refuseRepeats(ids, ctx, (index) => [index]);
  });

/** One issue per id seen before, at `pathOf(index)`. */
function refuseRepeats(
  ids: readonly string[],
  ctx: z.RefinementCtx,
  pathOf: (index: number) => (string | number)[],
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: pathOf(index),
        message: 'Listed more than once',
      });
    }
    seen.add(id);
  });
}

/** `PUT /roles/:id/permissions`: every permission the role should hold. */
export const replaceRolePermissionsSchema = z.object({ permissionIds: idSetField });

export type ReplaceRolePermissionsDto = z.infer<typeof replaceRolePermissionsSchema>;

/** `PUT /users/:id/roles`: every role the user should hold. */
export const replaceUserRolesSchema = z.object({ roleIds: idSetField });

export type ReplaceUserRolesDto = z.infer<typeof replaceUserRolesSchema>;

/** One grant of `PUT /users/:id/permissions`: the permission with its own expiry and note (absent = none). */
export const grantItemSchema = putGrantSchema.extend({ permissionId: z.string().uuid() });

export type GrantItem = z.infer<typeof grantItemSchema>;

/**
 * `PUT /users/:id/permissions`: every extra permission the user should hold, each with the expiry
 * and note it should have — a grant sent without them loses them, like any field left out.
 */
export const replaceUserPermissionsSchema = z.object({
  grants: z
    .array(grantItemSchema)
    .max(REPLACE_MAX_ITEMS)
    .superRefine((grants, ctx) => {
      refuseRepeats(
        grants.map(({ permissionId }) => permissionId),
        ctx,
        (index) => [index, 'permissionId'],
      );
    }),
});

export type ReplaceUserPermissionsDto = z.infer<typeof replaceUserPermissionsSchema>;

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

/** What a replace of grants did: also `updated` — kept, with a new expiry or note. */
export const grantChangeSchema = accessChangeSchema.extend({
  updated: z.array(changedItemSchema),
});

export type GrantChange = z.infer<typeof grantChangeSchema>;
