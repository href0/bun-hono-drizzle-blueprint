import { definePermissions } from '../../core/security/rbac';

/** The API permissions of the user-posts module (D47): read only. */
export const USER_POST_PERMISSIONS = definePermissions('user-posts', {
  read: "Read users' external posts",
});
