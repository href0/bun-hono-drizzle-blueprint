import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { createApp } from '../../app';
import { validate, getValidatedBody, getValidatedQuery, getValidatedParams } from './validate';
import { Hono } from 'hono';

describe('Validation Middleware (Integration)', () => {
  const app = createApp();

  it('POST /api/v1/users with invalid body should return 400 with sanitized validation error details', async () => {
    const res = await app.request('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'short',
      }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      message: string;
      error: {
        type: string;
        code: string;
        details?: Array<{ field: string; message: string }>;
      };
    };

    expect(body.success).toBe(false);
    expect(body.status_code).toBe(400);
    expect(body.message).toBe('Validation Failed');
    expect(body.error.type).toBe('VALIDATION_ERROR');
    expect(body.error.code).toBe('ERR_INVALID_INPUT');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details?.length).toBeGreaterThanOrEqual(2);

    const fields = body.error.details?.map((e) => e.field);
    expect(fields).toContain('email');
    expect(fields).toContain('fullName');
  });

  it('POST /api/v1/users with malformed JSON body should return 400 with explicit JSON error', async () => {
    const res = await app.request('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "test@mail.com", }', // trailing comma = invalid JSON
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      error: {
        type: string;
        code: string;
        details?: Array<{ field: string; message: string }>;
      };
    };

    expect(body.success).toBe(false);
    expect(body.status_code).toBe(400);
    expect(body.error.type).toBe('VALIDATION_ERROR');
    // Must explicitly say body is invalid JSON, not field-level errors
    expect(body.error.details?.[0]?.field).toBe('body');
    expect(body.error.details?.[0]?.message).toContain('invalid JSON');
  });

  it('should validate query and params and extract with getters', async () => {
    const testApp = new Hono();

    testApp.get(
      '/test/:id',
      validate({
        params: z.object({ id: z.coerce.number() }),
        query: z.object({ search: z.string() }),
      }),
      (c) => {
        const params = getValidatedParams<{ id: number }>(c);
        const query = getValidatedQuery<{ search: string }>(c);
        return c.json({ params, query });
      },
    );

    const res = await testApp.request('/test/123?search=hello');
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      params: { id: number };
      query: { search: string };
    };
    expect(data.params.id).toBe(123);
    expect(data.query.search).toBe('hello');
  });

  it('should validate body with helper getter', async () => {
    const testApp = new Hono();

    testApp.post(
      '/test',
      validate({
        body: z.object({ title: z.string() }),
      }),
      (c) => {
        const body = getValidatedBody<{ title: string }>(c);
        return c.json(body);
      },
    );

    const res = await testApp.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'valid' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { title: string };
    expect(data.title).toBe('valid');
  });

  it('should return {} for request with no body or non-JSON content type', async () => {
    const testApp = new Hono();
    const schema = z.object({ optional: z.string().optional() });

    testApp.post('/test', validate({ body: schema }), (c) => {
      const body = getValidatedBody<{ optional?: string }>(c);
      return c.json(body);
    });

    // Request with no Content-Type (body treated as empty)
    const res = await testApp.request('/test', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});
