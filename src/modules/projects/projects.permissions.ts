import { crudPermissions } from '../../core/security/rbac';

/** The API permissions of the projects module (D47): routes check `PROJECT_PERMISSIONS.<action>`. */
export const PROJECT_PERMISSIONS = crudPermissions('projects', 'projects');
