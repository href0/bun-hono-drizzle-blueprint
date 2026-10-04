import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../dto/common.dto';
import { globalErrorHandler } from './error-handler';
import { requestContextMiddleware } from './request-context';
import { getValidatedBody, getValidatedParams, getValidatedQuery, validate } from './validate';

interface ErrorBody {
  message: string;
  error: { type: string; code: string; details?: { field?: string; message: string }[] };
}

const bodySchema = z.object({
  fullName: z.string(),
  address: z.object({ postalCode: z.string().length(5) }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const buildApp = (): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.post('/people', validate({ body: bodySchema, preserveKeys: ['metadata'] }), (c) =>
    c.json(getValidatedBody(c)),
  );
  app.get('/people', validate({ query: paginationQuerySchema }), (c) =>
    c.json(getValidatedQuery(c)),
  );
  app.get('/people/:id', validate({ params: uuidParamSchema }), (c) =>
    c.json(getValidatedParams(c)),
  );
  app.onError(globalErrorHandler);
  return app;
};

const post = (payload: unknown, lang = 'en'): Response | Promise<Response> =>
  buildApp().request('/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': lang },
    body: JSON.stringify(payload),
  });

describe('snake_case request contract', () => {
  it('should accept snake_case keys and hand camelCase DTOs to the handler', async () => {
    const res = await post({ full_name: 'Ana', address: { postal_code: '12345' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fullName: 'Ana', address: { postalCode: '12345' } });
  });

  it('should reject camelCase keys with 400 and name each key exactly as sent', async () => {
    const res = await post({ fullName: 'Ana', address: { postalCode: '12345' } });
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.message).toBe('Field names must be snake_case (e.g. full_name)');
    expect(body.error).toMatchObject({ type: 'VALIDATION_ERROR', code: 'ERR_NON_SNAKE_CASE_KEY' });
    expect(body.error.details).toEqual([
      { field: 'fullName', message: 'Use snake_case for this field name' },
      { field: 'address.postalCode', message: 'Use snake_case for this field name' },
    ]);
  });

  it('should localize the rejection message', async () => {
    const body = (await (await post({ fullName: 'Ana' }, 'id')).json()) as ErrorBody;

    expect(body.message).toBe('Nama field harus snake_case (contoh: full_name)');
  });

  it('should report schema errors on nested fields in snake_case without internal prefixes', async () => {
    const res = await post({ full_name: 'Ana', address: { postal_code: '1' } });
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('ERR_INVALID_INPUT');
    expect(body.error.details?.map((detail) => detail.field)).toEqual(['address.postal_code']);
  });

  it('should keep preserved dictionaries verbatim and unchecked', async () => {
    const res = await post({ full_name: 'Ana', metadata: { someKey: 1, 'x-trace': 'a' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fullName: 'Ana', metadata: { someKey: 1, 'x-trace': 'a' } });
  });

  it('should apply the contract to query strings', async () => {
    const ok = await buildApp().request('/people?page=2&per_page=5');
    const rejected = await buildApp().request('/people?perPage=5', {
      headers: { 'Accept-Language': 'en' },
    });

    expect(await ok.json()).toEqual({ page: 2, perPage: 5 });
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as ErrorBody).error.details?.[0]?.field).toBe('perPage');
  });

  it('should leave route params untouched and reject a malformed UUID with 400', async () => {
    const id = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
    const ok = await buildApp().request(`/people/${id}`);
    const bad = await buildApp().request('/people/not-a-uuid');

    expect(await ok.json()).toEqual({ id });
    expect(bad.status).toBe(400);
  });

  it('should cap per_page at MAX_PER_PAGE', async () => {
    const res = await buildApp().request('/people?per_page=101');

    expect(res.status).toBe(400);
  });
});
