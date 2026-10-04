import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { bodySizeLimit } from './body-limit';
import { globalErrorHandler } from './error-handler';
import { validate } from './validate';

const buildApp = (): Hono => {
  const app = new Hono();
  app.use('*', bodySizeLimit(64));
  app.post('/echo', validate({ body: z.object({ note: z.string() }) }), (c) => c.text('ok'));
  app.onError(globalErrorHandler);
  return app;
};

const json = (note: string): string => JSON.stringify({ note });

const streamOf = (text: string): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

describe('bodySizeLimit', () => {
  const app = buildApp();

  it('lets a body within the limit through', async () => {
    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json('small'),
    });
    expect(res.status).toBe(200);
  });

  it('rejects an oversized body by Content-Length with 413 ERR_PAYLOAD_TOO_LARGE', async () => {
    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json('x'.repeat(100)),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string; type: string } };
    expect(body.error).toMatchObject({ code: 'ERR_PAYLOAD_TOO_LARGE', type: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects an oversized streamed body without Content-Length', async () => {
    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: streamOf(json('x'.repeat(100))),
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(413);
  });
});
