import { crudPermissions } from '../../../core/security/rbac';

/** The API permissions of the project-tasks module (D47): routes check `PROJECT_TASK_PERMISSIONS.<action>`. */
export const PROJECT_TASK_PERMISSIONS = crudPermissions('project-tasks', 'project tasks');
