/**
 * Converts a camelCase or PascalCase string into snake_case.
 * Handles acronyms and digits deterministically.
 */
export function toSnakeCase(key: string): string {
  if (!key) {
    return key;
  }

  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Converts a snake_case or kebab-case string into camelCase.
 */
export function toCamelCase(key: string): string {
  if (!key) {
    return key;
  }

  return key.replace(/([-_][a-z0-9])/gi, (group) =>
    group.toUpperCase().replace('-', '').replace('_', ''),
  );
}

/**
 * Recursively transforms object keys from camelCase to snake_case.
 * Leaves primitives, null, undefined, Date, and RegExp instances intact.
 */
export function camelToSnakeCase(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => camelToSnakeCase(item));
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);

  for (const [key, val] of entries) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = camelToSnakeCase(val);
  }

  return result;
}

/**
 * Recursively transforms object keys from snake_case to camelCase.
 * Leaves primitives, null, undefined, Date, and RegExp instances intact.
 */
export function snakeToCamelCase(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => snakeToCamelCase(item));
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);

  for (const [key, val] of entries) {
    const camelKey = toCamelCase(key);
    result[camelKey] = snakeToCamelCase(val);
  }

  return result;
}
