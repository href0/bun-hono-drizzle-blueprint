import { crudLabels, definePermissions } from '../../core/security/rbac';

/**
 * The API permissions of the partner-credentials module (D47): CRUD plus its own actions (D60) —
 * switching a partner on / off and rotating its keys.
 */
export const PARTNER_CREDENTIAL_PERMISSIONS = definePermissions('partner-credentials', {
  ...crudLabels('partner credentials'),
  activate: 'Activate partner credentials',
  deactivate: 'Deactivate partner credentials',
  rotateSecret: 'Rotate the signing secret of partner credentials',
  rotateApiKey: 'Rotate the API key of partner credentials',
});
