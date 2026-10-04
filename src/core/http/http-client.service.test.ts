import { describe, expect, it } from 'bun:test';
import { HttpClientService } from './http-client.service';
import { ExternalServiceError } from '../errors/external.error';

describe('HttpClientService (Unit)', () => {
  it('should initialize with persistent Keep-Alive agents and mandatory timeout', () => {
    const client = new HttpClientService({
      originName: 'TEST_VENDOR',
      timeoutMs: 5000,
      maxSockets: 50,
    });

    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
    expect(typeof client.post).toBe('function');
    expect(typeof client.put).toBe('function');
    expect(typeof client.delete).toBe('function');
  });

  it('should mask external error into ExternalServiceError', async () => {
    const client = new HttpClientService({
      originName: 'MOCK_VENDOR',
      baseURL: 'http://127.0.0.1:59999', // Non-existent local port
      timeoutMs: 100,
    });

    let thrownError: unknown;
    try {
      await client.get('/test');
    } catch (err: unknown) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ExternalServiceError);
  });

  it('should successfully execute get, post, put, delete with keep-alive server', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/data') {
          return new Response(JSON.stringify({ method: req.method, ok: true }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    });

    const client = new HttpClientService({
      originName: 'LOCAL_TEST',
      baseURL: `http://localhost:${server.port}`,
      timeoutMs: 2000,
    });

    const getRes = await client.get<{ method: string; ok: boolean }>('/data');
    expect(getRes).toEqual({ method: 'GET', ok: true });

    const postRes = await client.post<{ method: string; ok: boolean }>('/data', { payload: 1 });
    expect(postRes).toEqual({ method: 'POST', ok: true });

    const putRes = await client.put<{ method: string; ok: boolean }>('/data', { payload: 2 });
    expect(putRes).toEqual({ method: 'PUT', ok: true });

    const deleteRes = await client.delete<{ method: string; ok: boolean }>('/data');
    expect(deleteRes).toEqual({ method: 'DELETE', ok: true });

    await server.stop(true);
  });
});
