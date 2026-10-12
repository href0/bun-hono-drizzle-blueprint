import { afterAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { getClientIp } from '../context/request-context';
import { selectClientIp, UNKNOWN_CLIENT_IP } from './client-ip';
import { requestContextMiddleware } from './request-context';

describe('selectClientIp', () => {
  it('uses the socket address and ignores X-Forwarded-For when no proxy is trusted', () => {
    expect(selectClientIp('10.0.0.5', '6.6.6.6', 0)).toBe('10.0.0.5');
    expect(selectClientIp('::ffff:10.0.0.5', undefined, 0)).toBe('10.0.0.5');
  });

  it('takes the n-th entry from the right when n proxies are trusted', () => {
    // Client forged "6.6.6.6"; the edge proxy appended the real peer 203.0.113.7.
    expect(selectClientIp('10.0.0.1', '6.6.6.6, 203.0.113.7', 1)).toBe('203.0.113.7');
    // Two proxies: edge appended 203.0.113.7, the internal LB appended the edge 10.0.0.9.
    expect(selectClientIp('10.0.0.1', '6.6.6.6, 203.0.113.7, 10.0.0.9', 2)).toBe('203.0.113.7');
  });

  it('falls back to the leftmost entry when the chain is shorter than the trusted hops', () => {
    expect(selectClientIp('10.0.0.1', '203.0.113.7', 3)).toBe('203.0.113.7');
  });

  it('falls back to the socket address without the header or on a malformed entry', () => {
    expect(selectClientIp('10.0.0.1', undefined, 1)).toBe('10.0.0.1');
    expect(selectClientIp('10.0.0.1', ' , ', 1)).toBe('10.0.0.1');
    expect(selectClientIp('10.0.0.1', '6.6.6.6, not-an-ip', 1)).toBe('10.0.0.1');
  });

  it('reports unknown when there is no socket address', () => {
    expect(selectClientIp(undefined, '6.6.6.6', 0)).toBe(UNKNOWN_CLIENT_IP);
  });
});

describe('requestContextMiddleware client IP (real socket)', () => {
  const buildApp = (trustProxyHops: number): Hono => {
    const app = new Hono();
    app.use('*', requestContextMiddleware({ trustProxyHops }));
    app.get('/ip', (c) => c.text(getClientIp() ?? 'none'));
    return app;
  };
  const direct = Bun.serve({ port: 0, fetch: buildApp(0).fetch });
  const proxied = Bun.serve({ port: 0, fetch: buildApp(1).fetch });
  afterAll(async () => {
    await Promise.all([direct.stop(true), proxied.stop(true)]);
  });

  it('TRUST_PROXY_HOPS=0: a forged X-Forwarded-For never replaces the socket address', async () => {
    const res = await fetch(new URL('/ip', direct.url), {
      headers: { 'X-Forwarded-For': '6.6.6.6' },
    });
    expect(['127.0.0.1', '::1']).toContain(await res.text());
  });

  it('TRUST_PROXY_HOPS=1: the rightmost X-Forwarded-For entry is the client', async () => {
    const res = await fetch(new URL('/ip', proxied.url), {
      headers: { 'X-Forwarded-For': '6.6.6.6, 203.0.113.7' },
    });
    expect(await res.text()).toBe('203.0.113.7');
  });

  it('without a server (app.request) the client IP is unknown', async () => {
    const res = await buildApp(0).request('/ip');
    expect(await res.text()).toBe(UNKNOWN_CLIENT_IP);
  });
});
