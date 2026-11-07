import type { PermissionEndpoint, PermissionEndpoints } from '../security/rbac';

const PERMISSION_CALLER = 'permission:';
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

interface DocumentedOperation {
  summary?: unknown;
  'x-allowed-callers'?: unknown;
}

/**
 * Reads, from the OpenAPI document of the app, which endpoints each permission opens: every
 * operation whose `x-allowed-callers` (written by `requirePermission()` /
 * `requireSelfOrPermission()`) names `permission:<key>`. Derived from the routes, so the list
 * cannot drift from what the guards check (D47, R89).
 */
export const permissionEndpointsOf = (document: {
  paths?: Record<string, Record<string, unknown> | undefined>;
}): PermissionEndpoints => {
  const byKey = new Map<string, PermissionEndpoint[]>();
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const [method, value] of Object.entries(item ?? {})) {
      if (!HTTP_METHODS.has(method)) continue;
      const operation = value as DocumentedOperation;
      const callers = Array.isArray(operation['x-allowed-callers'])
        ? (operation['x-allowed-callers'] as unknown[])
        : [];
      for (const caller of callers) {
        if (typeof caller !== 'string' || !caller.startsWith(PERMISSION_CALLER)) continue;
        const key = caller.slice(PERMISSION_CALLER.length);
        const endpoints = byKey.get(key) ?? [];
        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: typeof operation.summary === 'string' ? operation.summary : '',
        });
        byKey.set(key, endpoints);
      }
    }
  }
  for (const endpoints of byKey.values()) {
    endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  }
  return byKey;
};
