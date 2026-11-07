import { crudPermissions } from '../../core/security/rbac';

/** The API permissions of the orders module (D47): routes check `ORDER_PERMISSIONS.<action>`. */
export const ORDER_PERMISSIONS = crudPermissions('orders', 'orders (with their items)');
