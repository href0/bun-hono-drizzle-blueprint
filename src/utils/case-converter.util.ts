const isUpper = (char: string | undefined): boolean =>
  char !== undefined && char >= 'A' && char <= 'Z';
const isLower = (char: string | undefined): boolean =>
  char !== undefined && char >= 'a' && char <= 'z';
const isDigit = (char: string | undefined): boolean =>
  char !== undefined && char >= '0' && char <= '9';

/**
 * Converts a camelCase or PascalCase string into snake_case (`userId` → `user_id`,
 * `HTTPServer` → `http_server`). Single linear pass: keys can come from clients, and the
 * previous regex (`([A-Z]+)([A-Z][a-z])`) backtracked quadratically on long uppercase runs.
 */
export function toSnakeCase(key: string): string {
  let result = '';
  for (let index = 0; index < key.length; index += 1) {
    const char = key[index];
    const previous = key[index - 1];
    if (
      isUpper(char) &&
      (isLower(previous) || isDigit(previous) || (isUpper(previous) && isLower(key[index + 1])))
    ) {
      result += '_';
    }
    result += char;
  }
  return result.toLowerCase();
}

const SNAKE_CASE_KEY = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** `user_id`, `page`, `address_line_2` — lowercase words joined by single underscores. */
export const isSnakeCaseKey = (key: string): boolean => SNAKE_CASE_KEY.test(key);

/**
 * Paths (as sent by the client, e.g. `address.postalCode`, `items.0.itemCode`) of every key
 * that is not snake_case. Top-level keys listed in `preserveKeys` are checked themselves but
 * their content is free-form (dictionaries).
 */
export function findNonSnakeCaseKeys(
  value: unknown,
  preserveKeys: readonly string[] = [],
  path = '',
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) =>
      findNonSnakeCaseKeys(item, [], `${path}${String(index)}.`),
    );
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const own = isSnakeCaseKey(key) ? [] : [`${path}${key}`];
    const nested =
      path === '' && preserveKeys.includes(key)
        ? []
        : findNonSnakeCaseKeys(child, [], `${path}${key}.`);
    return [...own, ...nested];
  });
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

/**
 * Inbound conversion for a request body/query: keys become camelCase recursively, except the
 * content of top-level `preserveKeys` (free-form dictionaries keep their keys as sent).
 */
export function snakeToCamelCasePreserving(
  value: unknown,
  preserveKeys: readonly string[],
): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return snakeToCamelCase(value);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      toCamelCase(key),
      preserveKeys.includes(key) ? child : snakeToCamelCase(child),
    ]),
  );
}
