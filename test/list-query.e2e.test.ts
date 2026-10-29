import { beforeAll, describe, expect, it } from 'bun:test';
import type { Hono } from 'hono';
import { createApp } from '../src/app';
import { appConfig } from '../src/config';
import { APP_ERROR_CODES } from '../src/core/errors';
import { authorize } from './helpers/authorized-app';

/**
 * The list convention on every paginated endpoint (D41, R85) — found in the OpenAPI document, so a
 * new list (a module of `bun run scaffold` included) is covered without being named here: it
 * documents `sort`, refuses a column outside its allowlist and an unknown parameter before any
 * service runs (validation is the first thing after authentication).
 */

/** An operation as the document has it: any status, media type or method may be absent. */
interface Operation {
  parameters?: { in: string; name: string }[];
  responses: Partial<
    Record<string, { content?: Partial<Record<string, { schema?: { properties?: object } }>> }>
  >;
}

const ANY_ID = '0192f1d0-0000-7000-8000-0000000000ff';

let admin: Hono;
let lists: { path: string; operation: Operation }[] = [];

beforeAll(async () => {
  const app = createApp();
  const res = await app.request(`${appConfig.API_BASE_PATH}/docs/openapi.json`);
  const doc = (await res.json()) as {
    paths: Record<string, Partial<Record<string, Operation>>>;
  };
  lists = Object.entries(doc.paths).flatMap(([path, operations]) => {
    const operation = operations.get;
    const schema = operation?.responses['200']?.content?.['application/json']?.schema;
    return operation !== undefined &&
      schema?.properties !== undefined &&
      'meta' in schema.properties
      ? [{ path, operation }]
      : [];
  });
  admin = await authorize(createApp(), 'admin');
});

const request = async (
  path: string,
  query: string,
): Promise<{
  status: number;
  code: string | undefined;
  details: { field: string; message: string }[];
}> => {
  const url = `${path.replace(/\{[^}]+\}/g, ANY_ID)}?${query}`;
  const res = await admin.request(url);
  const body = (await res.json()) as {
    error?: { code: string; details?: { field: string; message: string }[] };
  };
  return { status: res.status, code: body.error?.code, details: body.error?.details ?? [] };
};

describe('every paginated list follows the list convention (D41, R85)', () => {
  it('finds the lists in the document', () => {
    // `users` is in every project; the example lists leave with `bun run setup`.
    expect(lists.map((list) => list.path)).toContain(`${appConfig.API_BASE_PATH}/v1/users`);
  });

  it('each one documents sort', () => {
    const withoutSort = lists.filter(
      ({ operation }) =>
        !(operation.parameters ?? []).some(
          (parameter) => parameter.in === 'query' && parameter.name === 'sort',
        ),
    );
    expect(withoutSort.map((list) => list.path)).toEqual([]);
  });

  it('each one refuses an unknown parameter by name (never ignores it)', async () => {
    for (const { path } of lists) {
      const refused = await request(path, 'not_a_list_parameter=1');
      expect(`${path}: ${String(refused.status)} ${String(refused.code)}`).toBe(
        `${path}: 400 ${APP_ERROR_CODES.INVALID_INPUT}`,
      );
      expect(refused.details).toContainEqual({
        field: 'not_a_list_parameter',
        message: 'Unknown query parameter',
      });
    }
  });

  it('each one refuses a sort column outside its allowlist', async () => {
    for (const { path } of lists) {
      const refused = await request(path, 'sort=deleted_at');
      expect(`${path}: ${String(refused.status)}`).toBe(`${path}: 400`);
      expect(refused.details.at(0)?.message).toStartWith('Unknown sort field "deleted_at"');
    }
  });
});
