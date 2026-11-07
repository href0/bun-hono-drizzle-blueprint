import { crudPermissions, permission, type PermissionDefinition } from '../../core/security/rbac';

const GROUP = 'partner-credentials';

/**
 * The API permissions of the partner-credentials module (D47), collected in `src/permissions.ts`:
 * CRUD plus its own actions (D60) — switching a partner on / off and rotating its keys.
 */
export const PARTNER_CREDENTIAL_PERMISSIONS: readonly PermissionDefinition[] = [
  ...crudPermissions(GROUP, 'partner credentials'),
  permission(GROUP, 'activate', 'Activate partner credentials'),
  permission(GROUP, 'deactivate', 'Deactivate partner credentials'),
  permission(GROUP, 'rotate-secret', 'Rotate the signing secret of partner credentials'),
  permission(GROUP, 'rotate-api-key', 'Rotate the API key of partner credentials'),
];
