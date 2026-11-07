import { z } from 'zod';
import { instantField } from '../../core/dto/datetime.dto';
import { isoInstant } from '../../core/openapi';
import type { Permission, UserPermission } from '../../database/schema';
import { PERMISSION_SOURCES } from './rbac-permissions.dto';

/** `PUT /users/:id/permissions/:childId`: an extra permission (D51), optionally until `expires_at`. */
export const putGrantSchema = z.object({
  /** In the future; absent or null = no end. */
  expiresAt: instantField.nullable().optional(),
  /** Why the user has it (shown to admins). */
  note: z.string().trim().min(1).max(500).nullable().optional(),
});

export type PutGrantDto = z.infer<typeof putGrantSchema>;

/** A live grant with its permission (what the service returns, the transformer shapes). */
export interface GrantWithPermission {
  grant: UserPermission;
  permission: Permission;
}

/** One extra permission of a user, with the permission it gives. */
export const userGrantResponseSchema = z.object({
  id: z.string().uuid(),
  permission: z.object({
    id: z.string().uuid(),
    key: z.string(),
    label: z.string(),
    group: z.string(),
    source: z.enum(PERMISSION_SOURCES),
  }),
  /** Null = no end; a past value = expired (no longer counts, still listed until revoked). */
  expiresAt: isoInstant().nullable(),
  note: z.string().nullable(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type UserGrantResponse = z.infer<typeof userGrantResponseSchema>;

/** `GET /me/permissions`: what the frontend shows or hides (API and menu keys). */
export const myPermissionsResponseSchema = z.object({
  /** A super admin holds every permission; `permissions` then lists every key that counts. */
  superAdmin: z.boolean(),
  /** Sorted permission keys (`orders.read`, `menu.reports`). */
  permissions: z.array(z.string()),
});

export type MyPermissionsResponse = z.infer<typeof myPermissionsResponseSchema>;
