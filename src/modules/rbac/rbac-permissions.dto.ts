import { z } from 'zod';
import {
  booleanQueryField,
  listQuerySchema,
  searchQueryField,
  strictListQuery,
} from '../../core/dto/list-query.dto';
import { isoInstant } from '../../core/openapi';
import { PERMISSION_LIMITS } from '../../core/security/rbac';

/** Where a permission comes from (E1): the registry in code, or an administrator (frontend menus). */
export const PERMISSION_SOURCES = ['api', 'menu'] as const;

export type PermissionSource = (typeof PERMISSION_SOURCES)[number];

/** A menu permission key: `menu.` then kebab-case words, dot-separated (`menu.reports.monthly`). */
export const MENU_PERMISSION_KEY_PATTERN = /^menu(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

const labelField = z.string().trim().min(1, 'Label is required').max(PERMISSION_LIMITS.label);
const groupField = z.string().trim().min(1, 'Group is required').max(PERMISSION_LIMITS.group);

/** Only menu permissions are created through the API; API permissions come from the registry. */
export const createMenuPermissionSchema = z.object({
  key: z
    .string()
    .max(PERMISSION_LIMITS.key)
    .regex(
      MENU_PERMISSION_KEY_PATTERN,
      'menu. followed by kebab-case words separated by dots (menu.reports)',
    ),
  label: labelField,
  group: groupField,
});

export type CreateMenuPermissionDto = z.infer<typeof createMenuPermissionSchema>;

/** Label and group only: the key never changes (the frontend refers to it). */
export const updateMenuPermissionSchema = z
  .object({ label: labelField, group: groupField })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateMenuPermissionDto = z.infer<typeof updateMenuPermissionSchema>;

/** Fields `GET /permissions` may sort by (D41). */
export const PERMISSION_SORTABLE = ['key', 'group', 'createdAt'] as const;

export type PermissionSortField = (typeof PERMISSION_SORTABLE)[number];

/** `GET /permissions?sort=&q=&source=&group=&retired=`; `q` searches key and label. */
export const permissionListQuerySchema = strictListQuery(
  listQuerySchema(PERMISSION_SORTABLE).extend({
    q: searchQueryField,
    source: z.enum(PERMISSION_SOURCES).optional(),
    group: z.string().trim().min(1).max(PERMISSION_LIMITS.group).optional(),
    /** `true` = only retired API permissions (E4), `false` = only those that count. */
    retired: booleanQueryField,
  }),
);

export type PermissionListQueryDto = z.infer<typeof permissionListQuerySchema>;

/** An endpoint the permission opens (derived from the routes, D47). */
export const permissionEndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  summary: z.string(),
});

/** Response shape (camelCase here; snake_case on the wire). */
export const permissionResponseSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  group: z.string(),
  source: z.enum(PERMISSION_SOURCES),
  /** Set when an API permission left the code (E4): it no longer counts. */
  retiredAt: isoInstant().nullable(),
  /** The endpoints this permission opens; empty for menu permissions. */
  endpoints: z.array(permissionEndpointSchema),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type PermissionResponse = z.infer<typeof permissionResponseSchema>;
