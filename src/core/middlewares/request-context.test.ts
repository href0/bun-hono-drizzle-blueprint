import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { Writable } from 'node:stream';
import pino from 'pino';
import { getRequestContext, runWithRequestContext } from '../context/request-context';
import { BadRequestError } from '../errors';
import { requestContextMixin } from '../logger/logger';
import { globalErrorHandler } from './error-handler';
import { notFoundHandler } from './not-found';
import { REQUEST_ID_HEADER, requestContextMiddleware } from './request-context';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const buildApp = (): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.get('/whoami', async (c) => {
    await new Promise((resolve) => setTimeout(resolve, Number(c.req.query('delay') ?? 0)));
    return c.json({ requestId: getRequestContext()?.requestId, actor: getRequestContext()?.actor });
  });
  app.get('/fail', () => {
    throw new BadRequestError('Invalid state');
  });
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);
  return app;
};

describe('requestContextMiddleware (Unit)', () => {
  const app = buildApp();

  it('should propagate a safe inbound request ID to the handler and the response', async () => {
    const res = await app.request('/whoami', { headers: { [REQUEST_ID_HEADER]: 'gw-123' } });

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe('gw-123');
    expect(await res.json()).toEqual({ requestId: 'gw-123', actor: 'anonymous' });
  });

  it('should replace an unsafe inbound request ID with a UUID v7', async () => {
    const res = await app.request('/whoami', {
      headers: { [REQUEST_ID_HEADER]: 'evil line with spaces' },
    });
    const body = (await res.json()) as { requestId: string };

    expect(body.requestId).toMatch(UUID_V7);
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(body.requestId);
  });

  it('should keep concurrent requests isolated', async () => {
    const call = async (id: string, delay: number): Promise<unknown> =>
      (
        await app.request(`/whoami?delay=${String(delay)}`, {
          headers: { [REQUEST_ID_HEADER]: id },
        })
      ).json();

    const bodies = await Promise.all([call('r1', 15), call('r2', 1), call('r3', 8)]);

    expect(bodies.map((body) => (body as { requestId: string }).requestId)).toEqual([
      'r1',
      'r2',
      'r3',
    ]);
  });

  it('should expose the same request ID in error and not-found envelopes', async () => {
    const failed = await app.request('/fail', { headers: { [REQUEST_ID_HEADER]: 'err-1' } });
    const missing = await app.request('/nope', { headers: { [REQUEST_ID_HEADER]: 'miss-1' } });

    expect(failed.status).toBe(400);
    expect(failed.headers.get(REQUEST_ID_HEADER)).toBe('err-1');
    expect(((await failed.json()) as { request_id: string }).request_id).toBe('err-1');
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { request_id: string }).request_id).toBe('miss-1');
  });
});

describe('requestContextMixin (Unit)', () => {
  it('should add requestId and actor to logs written inside a request only', async () => {
    const lines: Record<string, unknown>[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        callback();
      },
    });
    const log = pino({ mixin: requestContextMixin }, destination);

    log.info('outside');
    await runWithRequestContext({ requestId: 'log-1', actor: 'user:7' }, async () => {
      await Promise.resolve();
      log.info('inside');
    });

    expect(lines[0]).not.toHaveProperty('requestId');
    expect(lines[1]).toMatchObject({ msg: 'inside', requestId: 'log-1', actor: 'user:7' });
  });
});
