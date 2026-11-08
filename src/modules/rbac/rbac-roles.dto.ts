import { z } from 'zod';
import {
  booleanQueryField,
  listQuerySchema,
  searchQueryField,
  strictListQuery,
} from '../../core/dto/list-query.dto';
import { isoInstant } from '../../core/openapi';
import type { Role } from '../../database/schema';

/** A role key: lower case letters, digits and `_`, starting with a letter (`finance_staff`). */
export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const roleNameField = z.string().trim().min(1, 'Name is required').max(100);
const roleDescriptionField = z.string().trim().max(500).nullable();

/** The key is permanent: code and seeds refer to it (`super_admin`, `user`). */
export const createRoleSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(50)
    .regex(ROLE_KEY_PATTERN, 'Lower case letters, digits and _, starting with a letter'),
  name: roleNameField,
  description: roleDescriptionField.optional(),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;

/** Name and description only: the key never changes. */
export const updateRoleSchema = z
  .object({ name: roleNameField, description: roleDescriptionField })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

/** Fields `GET /roles` may sort by (D41); the repository maps each one to its column. */
export const ROLE_SORTABLE = ['createdAt', 'updatedAt', 'key', 'name'] as const;

export type RoleSortField = (typeof ROLE_SORTABLE)[number];

/** `GET /roles?sort=&q=&is_system=`; `q` searches key and name. */
export const roleListQuerySchema = strictListQuery(
  listQuerySchema(ROLE_SORTABLE).extend({ q: searchQueryField, isSystem: booleanQueryField }),
);

export type RoleListQueryDto = z.infer<typeof roleListQuerySchema>;

/** Response shape (camelCase here; snake_case on the wire). */
export const roleResponseSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** `super_admin` and `user`: created by the platform, never deleted. */
  isSystem: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type RoleResponse = z.infer<typeof roleResponseSchema>;

/** A role with whether the caller may give or take it (`GET /roles/options`, D73). */
export interface RoleOption {
  role: Role;
  grantable: boolean;
}

/** One box of the role checklist of a user (D73). */
export const roleOptionSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  isSystem: z.boolean(),
  /**
   * The caller holds every permission the role gives (`super_admin`: the caller is a super admin):
   * giving or taking it would not be refused (D69, D74).
   */
  grantable: z.boolean(),
});

export type RoleOptionResponse = z.infer<typeof roleOptionSchema>;
