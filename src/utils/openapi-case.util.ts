import { toSnakeCase } from './case-converter.util';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const renameKeys = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [toSnakeCase(key), value]));

const convert = (node: unknown): unknown => {
  if (Array.isArray(node)) return (node as unknown[]).map(convert);
  if (!isRecord(node)) return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && isRecord(value)) {
      result[key] = convert(renameKeys(value));
    } else if (key === 'required' && Array.isArray(value)) {
      result[key] = (value as unknown[]).map((entry) =>
        typeof entry === 'string' ? toSnakeCase(entry) : entry,
      );
    } else {
      result[key] = convert(value);
    }
  }
  // Query parameter names are wire names; path parameter names must match the route template.
  if (result.in === 'query' && typeof result.name === 'string') {
    result.name = toSnakeCase(result.name);
  }
  return result;
};

/**
 * Converts an OpenAPI document generated from camelCase Zod schemas to the snake_case wire
 * contract: schema property names, `required` lists and query parameter names. Component names,
 * operation ids and path parameters are left alone.
 */
export const toSnakeCaseOpenApi = <T>(document: T): T => convert(document) as T;
