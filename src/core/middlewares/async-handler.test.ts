import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ApiResponse } from '../response/api-response';
import { asyncHandler, type PureHandler } from './async-handler';

describe('asyncHandler (Unit)', () => {
  it('should serialize an ApiResponse with its status code', async () => {
    const app = new Hono();
    app.get(
      '/',
      asyncHandler(() => Promise.resolve(new ApiResponse({ itemCount: 1 }, 'Created', 201))),
    );

    const res = await app.request('/');

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      status_code: 201,
      message: 'Created',
      data: { item_count: 1 },
    });
  });

  it('should pass through a result that is not an ApiResponse', async () => {
    const app = new Hono();
    const rawHandler = (() =>
      Promise.resolve(new Response('raw', { status: 202 }))) as unknown as PureHandler;
    app.get('/', asyncHandler(rawHandler));

    const res = await app.request('/');

    expect(res.status).toBe(202);
    expect(await res.text()).toBe('raw');
  });
});
